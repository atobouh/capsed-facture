import { useState } from "react";
import { Check, ChevronLeft, FileText, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { decimalLabel, invoiceTotals, lineAmount, measureName, normalizePayment, threeDecimals } from "../invoice-math";
import type { InvoiceColumns, Measure, TaxMode, WeightUnit } from "../invoice-math";
import { fixedModel } from "../invoice-format";
import { Button, Choice, DateInput, Field, MoneyInput, Notice, NumberInput, Paper, SearchBox, TextArea, TextInput, matches, toast } from "./ui";
import { ClientForm } from "./clients";
import { DEFAULT_TERM, METHODS, addDays, balance, commit, termOf, dateFr, dateValid, emptyClient, emptyLine, getData, money, monthLabel, nextInvoiceNumber, nowIso, todayIso, uid, useData } from "./store";
import type { Client, Invoice, Line } from "./store";
import { words } from "./words";

export type Draft = { number: string; clientId: string; date: string; lines: Line[]; taxRate: number; taxMode: TaxMode; discountRate: number; advance: number; payment: string; note: string; purchaseOrder: string; reference: string; paymentTerm: number; measure: Measure; columns: InvoiceColumns; weightUnit: WeightUnit };
const STEPS = ["Client et facture", "Articles et prestations", "Remise, TVA et règlement", "Vérifier et émettre"];
type Habits = Pick<Draft, "measure" | "columns" | "weightUnit">;
const BASIC: Habits = { measure: "quantite", columns: { destination: true }, weightUnit: "kg" };
/** A new invoice starts like the last one made for the same client (quantity or volume, same columns). */
function habitsOf(clientId: string): Habits {
  const last = getData().invoices.filter(i => i.client.id === clientId && i.columns).sort((a, b) => b.date.localeCompare(a.date))[0];
  return last ? { measure: last.measure ?? "quantite", columns: { ...last.columns }, weightUnit: last.weightUnit ?? "kg" } : BASIC;
}
const OPTIONAL: [keyof InvoiceColumns, string][] = [["contract", "N° de contrat"], ["destination", "Destination"], ["lot", "N° de lot"], ["weight", "Poids"]];
/** The lines as saved: a column that is not chosen keeps nothing, so it can never come back on the invoice by surprise. */
function cleanLines({ lines, columns: c }: Draft): Line[] {
  return lines.filter(l => l.designation.trim()).map(({ lot, weight, ...l }) => ({ ...l, contract: c.contract ? l.contract.trim() : "", destination: c.destination ? l.destination : "", ...(c.lot && lot?.trim() ? { lot: lot.trim() } : {}), ...(c.weight && weight ? { weight } : {}) }));
}

/** The 4-step invoice flow. `validated`: made by the Direction, so it does not come back to validate.
 *  `legacy`: an invoice made before the app, typed in with its original number and date. */
/** A new invoice record, as the composer saves it (also used to save old invoices read from their PDF). */
export function newInvoiceRecord(cur: ReturnType<typeof getData>, draft: Draft, client: Client, by: string, extra: Partial<Invoice>): Invoice {
  const lines = cleanLines(draft);
  return { measure: draft.measure, columns: { ...draft.columns }, weightUnit: draft.weightUnit, date: draft.date, client: { ...client }, company: { ...cur.company, logo: "" }, lines, taxRate: draft.taxRate, taxMode: draft.taxMode, discountRate: draft.discountRate, purchaseOrder: draft.purchaseOrder.trim(), ...(draft.reference.trim() ? { reference: draft.reference.trim() } : {}), advance: draft.advance, payment: draft.payment, note: draft.note, paymentTerm: draft.paymentTerm, template: { document: fixedModel(cur.format) }, id: uid(), number: draft.number.trim(), createdBy: by, ...extra };
}
/** A number already used, by an invoice or by one the Direction deleted (deleted numbers are never given again). */
export function numberTaken(d: ReturnType<typeof getData>, n: string) {
  const k = n.trim().toLowerCase();
  return d.invoices.find(i => i.number.trim().toLowerCase() === k) ?? (d.bin ?? []).find(b => b.collection === "invoices" && String(b.data.number ?? "").trim().toLowerCase() === k)?.data as Invoice | undefined;
}
export const emptyDraft = (legacy = false): Draft => ({ number: "", clientId: "", date: legacy ? (getData().month < todayIso().slice(0, 7) ? getData().month + "-01" : "") : todayIso(), lines: [emptyLine()], taxRate: 19.25, taxMode: "ht", discountRate: 0, advance: 0, payment: "Espèces", note: "", purchaseOrder: "", reference: "", paymentTerm: getData().paymentTerm ?? DEFAULT_TERM, ...BASIC, columns: { ...BASIC.columns } });

/** `initial`, `readClient`, `source`: an old invoice read from a PDF, to check before saving. */
export default function Composer({ editId, clientId, requestId, by, validated, legacy: newLegacy, initial, readClient, source, startStep, onDone, onCancel }: { editId?: string; clientId?: string; requestId?: string; by: string; validated?: boolean; legacy?: boolean; initial?: Partial<Draft>; readClient?: Partial<Client>; source?: { file: string; warnings: string[] }; startStep?: number; onDone: (invoiceId: string) => void; onCancel: () => void }) {
  const d = useData(), editing = d.invoices.find(i => i.id === editId), legacy = editing ? !!editing.legacy : !!newLegacy;
  const [draft, setDraft] = useState<Draft>(() => editing ? { number: editing.number, clientId: editing.client.id, date: editing.date, lines: editing.lines.map(l => ({ ...l })), taxRate: editing.taxRate, taxMode: invoiceTotals(editing).taxMode, discountRate: editing.discountRate || 0, advance: editing.advance, payment: normalizePayment(editing.payment), note: editing.note, purchaseOrder: editing.purchaseOrder || "", reference: editing.reference || "", paymentTerm: termOf(editing), measure: editing.measure ?? "quantite", columns: editing.columns ?? { contract: editing.lines.some(l => l.contract.trim()), destination: true }, weightUnit: editing.weightUnit ?? "kg" }
    : { ...emptyDraft(legacy), ...habitsOf(clientId ?? getData().requests.find(r => r.id === requestId)?.clientId ?? ""), clientId: clientId ?? getData().requests.find(r => r.id === requestId)?.clientId ?? "", ...initial });
  // A draft read from a file already says how it counts and which columns it has: the client's habits do not override it.
  const [step, setStep] = useState(startStep ?? 0), [error, setError] = useState(""), [q, setQ] = useState(readClient?.name ?? ""), [form, setForm] = useState<Client | null>(null), [touched, setTouched] = useState(!!initial?.columns);
  const set = (p: Partial<Draft>) => { setDraft(v => ({ ...v, ...p })); setError(""); };
  const setLine = (id: string, p: Partial<Line>) => set({ lines: draft.lines.map(l => l.id === id ? { ...l, ...p } : l) });
  const habit = (p: Partial<Habits>) => { setTouched(true); set(p); };
  // Choosing the client of a new invoice brings back how its last invoice was made, until something is chosen by hand.
  const pickClient = (id: string) => set(editing || touched || !id ? { clientId: id } : { clientId: id, ...habitsOf(id) });
  const volume = draft.measure === "volume", cols = draft.columns, unitOf = (u: WeightUnit) => u === "t" ? "t" : "kg";
  const chosen = d.clients.find(c => c.id === draft.clientId), totals = invoiceTotals(draft), period = draft.date.slice(0, 7);
  const number = editing?.number ?? (legacy ? draft.number.trim() || "—" : dateValid(draft.date) ? nextInvoiceNumber(d, period) : "—");
  const request = d.requests.find(r => r.id === requestId);

  function check(upTo: number): [number, string] | null {
    if (!chosen) return [0, "Choisissez un client."];
    if (chosen.archived && !editing) return [0, "Ce client est archivé. Réactivez-le avant de créer une facture."];
    if (legacy && !editing) {
      const n = draft.number.trim(), same = numberTaken(d, n);
      if (!n) return [0, "Écrivez le numéro de l’ancienne facture, tel qu’il est imprimé dessus."];
      if (n.length > 40) return [0, "Ce numéro est trop long (40 caractères au plus)."];
      if (same) return [0, same.client ? `Le numéro ${n} existe déjà : facture de ${same.client.name} du ${dateFr(same.date)}.` : `Le numéro ${n} a déjà servi (facture supprimée par la Direction).`];
    }
    if (!dateValid(draft.date)) return [0, legacy ? "Choisissez la date de l’ancienne facture." : "Choisissez une date valide."];
    if (legacy && draft.date > todayIso()) return [0, "Une ancienne facture a une date passée."];
    if (d.closedMonths.includes(period)) return [0, `${monthLabel(period)} est clôturé : choisissez une date d’un mois ouvert${legacy ? ", ou demandez à la Direction de le rouvrir (Réglages, Règles et dérogations)" : ""}.`];
    if (editing && !legacy && period !== editing.date.slice(0, 7)) return [0, "La date doit rester dans le mois du numéro de facture."];
    if (editing && draft.clientId !== editing.client.id && (d.payments.some(p => p.invoiceId === editing.id && !p.cancelledAt) || d.credits.some(c => c.invoiceId === editing.id))) return [0, "Cette facture a des paiements ou des avoirs : conservez le même client."];
    if (upTo < 1) return null;
    const lines = draft.lines.filter(l => l.designation.trim());
    if (!lines.length || draft.lines.some(l => !l.designation.trim() && l.unitPrice > 0)) return [1, "Chaque article doit avoir une désignation."];
    const what = volume ? "un volume" : "une quantité";
    if (lines.some(l => !(l.quantity > 0) || !threeDecimals(l.quantity))) return [1, `Chaque article doit avoir ${what} supérieur à zéro, avec 3 chiffres après la virgule au plus (ex. 19,245).`];
    if (lines.some(l => !Number.isSafeInteger(l.unitPrice) || l.unitPrice < 0)) return [1, "Le prix unitaire est un nombre entier de francs CFA."];
    if (cols.weight && lines.some(l => l.weight !== undefined && (l.weight < 0 || !threeDecimals(l.weight)))) return [1, "Le poids a 3 chiffres après la virgule au plus."];
    if (upTo < 2) return null;
    if (!Number.isFinite(draft.taxRate) || draft.taxRate < 0 || draft.taxRate > 100 || !Number.isFinite(draft.discountRate) || draft.discountRate < 0 || draft.discountRate > 100) return [2, "La TVA et la remise doivent être comprises entre 0 et 100 %."];
    // An old invoice whose document shows no payment mode: chosen here, never « Espèces » by default.
    if (!draft.payment) return [2, "Choisissez le mode de règlement : le document importé n’en indique pas."];
    if (!Number.isSafeInteger(draft.paymentTerm) || draft.paymentTerm < 0 || draft.paymentTerm > 365) return [2, "Le délai de paiement doit être un nombre de jours entre 0 et 365."];
    if (!Number.isSafeInteger(draft.advance) || draft.advance < 0 || draft.advance > totals.ttc) return [2, `L’avance doit être comprise entre zéro et le total (${money(totals.ttc)}).`];
    if (editing) {
      const previous = d.credits.filter(c => c.invoiceId === editing.id), fin = (ls: Line[]) => JSON.stringify(ls.map(l => ({ id: l.id, quantity: l.quantity, unitPrice: l.unitPrice })));
      const same = draft.discountRate === (editing.discountRate || 0) && draft.taxMode === invoiceTotals(editing).taxMode && draft.taxRate === editing.taxRate;
      if (previous.some(c => c.lines?.length) && (fin(lines) !== fin(editing.lines) || !same)) return [1, "Cette facture a un avoir par article : ses quantités, prix, remise et TVA sont conservés. Les textes restent modifiables."];
      if (totals.ttc < previous.reduce((n, c) => n + c.amount, 0)) return [1, "Le nouveau montant ne peut pas être inférieur aux avoirs déjà émis."];
    }
    return null;
  }
  function next() { const e = check(step); if (e && e[0] <= step) { setStep(e[0]); setError(e[1]); return; } setError(""); setStep(s => s + 1); }
  function save() {
    const e = check(3); if (e) { setStep(e[0]); setError(e[1]); return; }
    const cur = getData(), lines = cleanLines(draft);
    const data = { date: draft.date, client: { ...chosen! }, company: editing?.company ?? { ...cur.company, logo: "" }, lines, taxRate: draft.taxMode === "ttc" ? draft.taxRate : editing?.taxRate ?? draft.taxRate, taxMode: draft.taxMode, discountRate: draft.discountRate, purchaseOrder: draft.purchaseOrder.trim(), reference: draft.reference.trim() || undefined, advance: draft.advance, payment: draft.payment, note: draft.note, paymentTerm: draft.paymentTerm, measure: draft.measure, columns: { ...cols }, weightUnit: draft.weightUnit, template: editing?.template ?? { document: fixedModel(cur.format) } };
    let invoice: Invoice;
    if (editing) {
      const { history, ...previous } = editing; const stamp = nowIso();
      invoice = { ...editing, ...data, validatedAt: undefined, validatedBy: undefined, revisedAt: stamp, history: [...(history ?? []), { ...previous, savedAt: stamp }] as Invoice["history"] };
      commit(by, x => ({ invoices: x.invoices.map(i => i.id === invoice.id ? invoice : i) }), { text: `Facture ${invoice.number} modifiée, version précédente conservée`, clientId: invoice.client.id, invoiceId: invoice.id });
      toast("Modifications enregistrées. Le numéro et la version précédente sont conservés.");
    } else {
      invoice = { ...data, id: uid(), number: legacy ? draft.number.trim() : nextInvoiceNumber(cur, period), createdBy: by, ...(legacy ? { legacy: true } : {}), ...(validated ? { validatedAt: nowIso(), validatedBy: by } : {}) };
      commit(by, x => ({ invoices: [...x.invoices, invoice], month: period, requests: request ? x.requests.map(r => r.id === request.id ? { ...r, readAt: r.readAt ?? nowIso(), resolvedAt: nowIso(), resolvedBy: by, linkedId: invoice.id, response: `Facture ${invoice.number} créée, ${money(invoiceTotals(invoice).ttc)}.` } : r) : x.requests }), { text: legacy ? `Ancienne facture ${invoice.number} du ${dateFr(invoice.date)} ${source ? "reprise de son PDF" : "ajoutée"}, ${money(invoiceTotals(invoice).ttc)}` : `Facture ${invoice.number} émise, ${money(invoiceTotals(invoice).ttc)}`, clientId: invoice.client.id, invoiceId: invoice.id });
      toast(legacy ? `Ancienne facture ${invoice.number} ajoutée.` : `Facture ${invoice.number} émise.${request ? " La demande du responsable est marquée comme traitée." : ""}`);
    }
    onDone(invoice.id);
  }
  const clients = d.clients.filter(c => (!c.archived || c.id === editing?.client.id) && matches(q, c.name, c.niu, c.address, c.phone)).sort((a, b) => a.name.localeCompare(b.name));
  const summary = <aside className="cx-summary cx-noprint">
    <h3>Total de la facture</h3>
    {totals.discount > 0 && <><p><span>Montant de départ</span><strong>{money(totals.subtotal)}</strong></p><p><span>Remise ({String(draft.discountRate).replace(".", ",")} %)</span><strong>− {money(totals.discount)}</strong></p></>}
    <p><span>{totals.discount > 0 ? "Montant HT après remise" : "Montant HT"}</span><strong>{money(totals.ht)}</strong></p>
    {draft.taxMode === "ttc" && <><p><span>TVA ({String(draft.taxRate).replace(".", ",")} %)</span><strong>{money(totals.tax)}</strong></p><p><span>Total TTC</span><strong>{money(totals.ttc)}</strong></p></>}
    {draft.advance > 0 && <p><span>Avance reçue</span><strong>− {money(draft.advance)}</strong></p>}
    <div className="cx-summary-total"><span>{draft.advance > 0 ? "Reste à payer" : totals.totalLabel}</span><strong>{money(totals.due)}</strong></div>
    {totals.ttc > 0 && <small className="cx-words">{words(totals.ttc)} francs CFA</small>}
    {editing && <p className="cx-muted">Le numéro {editing.number} reste identique. La version précédente est conservée.</p>}
  </aside>;

  // The Direction deleted this invoice while it was open here: nothing to save over.
  if (editId && !editing) return <section className="cx-wizard"><Notice tone="warn" title="Cette facture a été supprimée par la Direction">Vos changements ne peuvent pas être enregistrés. La Direction peut la restaurer si besoin.</Notice><Button onClick={onCancel}>Retour</Button></section>;
  return <section className="cx-wizard">
    <header className="cx-wizard-head cx-noprint">
      <div><h1>{editing ? `Modifier la facture ${editing.number}` : legacy ? "Ajouter une ancienne facture" : "Nouvelle facture"}</h1><p>Étape {step + 1} sur 4 : {STEPS[step]}</p></div>
      <Button kind="quiet" onClick={onCancel}>Quitter sans enregistrer</Button>
    </header>
    <ol className="cx-steps cx-noprint">{STEPS.map((s, i) => <li key={s} className={i < step ? "cx-done" : i === step ? "cx-now" : ""}><button type="button" disabled={i > step} onClick={() => { setStep(i); setError(""); }}><span>{i < step ? <Check size={18} strokeWidth={3} aria-label="fait" /> : i + 1}</span>{s}</button></li>)}</ol>
    {request && <Notice title="Demande du responsable">{request.message || "Créer une facture pour ce client."}{request.amount ? ` Montant indiqué : ${money(request.amount)}.` : ""}</Notice>}
    {source && <Notice tone={source.warnings.length ? "warn" : "info"} title={`Lue dans « ${source.file} »`}>Vérifiez chaque étape avant d’enregistrer : le PDF n’est pas gardé.{source.warnings.length ? <> À regarder : {source.warnings.join(" ")}</> : null}{readClient?.name && !draft.clientId ? <> Client lu sur le PDF : <strong>{readClient.name}</strong>. Choisissez-le dans la liste, ou « Nouveau client » (ses coordonnées lues sont reprises).</> : null}</Notice>}
    {legacy && !editing && step === 0 && !source && <Notice title="Facture faite avant l’application">Gardez son numéro et sa date d’origine. Elle compte dans le compte du client comme les autres, et ne change pas la numérotation automatique des nouvelles factures.</Notice>}
    {error && <Notice tone="bad" title="À corriger avant de continuer">{error}</Notice>}
    <div className={step < 3 ? "cx-compose" : ""}>
      <div className="cx-compose-body">
        {step === 0 && <>
          <div className="cx-card">
            <div className="cx-section-title"><h2>Le client</h2></div>
            {chosen ? <div className="cx-chosen"><span className="cx-monogram">{chosen.name.slice(0, 2).toUpperCase()}</span><div><strong>{chosen.name}</strong><span>{[chosen.address, chosen.niu && `NIU ${chosen.niu}`].filter(Boolean).join(", ") || "Coordonnées à compléter"}</span></div>
              <div className="cx-chosen-actions"><Button size="sm" kind="quiet" icon={<Pencil size={15} />} onClick={() => setForm({ ...chosen })}>Modifier les coordonnées</Button><Button size="sm" kind="link" onClick={() => set({ clientId: "" })}>Changer de client</Button></div></div>
              : <><div className="cx-search-row"><SearchBox value={q} onChange={setQ} placeholder="Tapez le nom du client" autoFocus /><Button icon={<UserPlus size={18} />} onClick={() => setForm({ ...emptyClient(), ...readClient, name: q })}>Nouveau client</Button></div>
                <div className="cx-pick-list">{clients.map(c => <button type="button" key={c.id} onClick={() => pickClient(c.id)}><span className="cx-monogram">{c.name.slice(0, 2).toUpperCase()}</span><span><strong>{c.name}</strong><small>{[c.address, c.phone].filter(Boolean).join(", ")}</small></span></button>)}{!clients.length && <p className="cx-muted">Aucun client ne correspond. Utilisez « Nouveau client ».</p>}</div></>}
          </div>
          <div className="cx-card">
            <div className="cx-section-title"><h2>La facture</h2></div>
            <div className="cx-form-grid">
              {legacy && !editing && <Field label="Numéro d’origine" required hint="Tel qu’il est imprimé sur la facture."><TextInput value={draft.number} onChange={v => set({ number: v })} placeholder="Ex. 2026-06-015" autoFocus={!!chosen} /></Field>}
              <Field label="Date de facture" required hint={legacy ? "La date d’origine. Les mois clôturés restent protégés." : editing ? "La date reste dans le mois du numéro." : "Les mois clôturés restent protégés."}><DateInput value={draft.date} onChange={v => set({ date: v })} /></Field>
              {draft.reference && <Field label="Référence de la facture" hint="Reprise telle quelle du document importé. Elle ne se modifie pas."><input className="cx-input" value={draft.reference} readOnly aria-readonly="true" /></Field>}
              <Field label="Numéro de bon de commande" optional><TextInput value={draft.purchaseOrder} onChange={v => set({ purchaseOrder: v })} placeholder="Ex. BC-2026-014" /></Field>
            </div>
            <Field label="Type de facture" required><Choice value={draft.taxMode} onChange={v => set({ taxMode: v, taxRate: v === "ttc" && !draft.taxRate ? 19.25 : draft.taxRate })} options={[{ value: "ht", label: "Facture hors taxe", sub: "Sans TVA" }, { value: "ttc", label: "Facture TTC", sub: "La TVA s’ajoute après la remise" }]} /></Field>
            {draft.taxMode === "ttc" && <p className="cx-hint">Les prix sont saisis hors taxe. Le taux de TVA se règle à l’étape 3.</p>}
            <Field label="Le montant se calcule avec" required hint="Une facture compte soit des quantités, soit des volumes, jamais les deux."><Choice value={draft.measure} onChange={v => habit({ measure: v })} options={[{ value: "quantite", label: "Quantité × prix unitaire", sub: "Nombre de colis, de conteneurs…" }, { value: "volume", label: "Volume × prix unitaire", sub: "En mètres cubes (m³)" }]} /></Field>
          </div>
        </>}
        {step === 1 && <div className="cx-card">
          <div className="cx-section-title"><h2>Articles et prestations</h2><span className="cx-muted">{chosen?.name}</span></div>
          <div className="cx-columns-pick">
            <h3>Colonnes de la facture</h3>
            <div className="cx-toggles">{OPTIONAL.map(([k, label]) => <button type="button" key={k} aria-pressed={!!cols[k]} className={`cx-toggle${cols[k] ? " cx-on" : ""}`} onClick={() => habit({ columns: { ...cols, [k]: !cols[k] } })}>{cols[k] ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{label}</button>)}
              {cols.weight && <span className="cx-unit-pick">en {(["kg", "t"] as WeightUnit[]).map(u => <button type="button" key={u} aria-pressed={draft.weightUnit === u} className={`cx-toggle cx-toggle-sm${draft.weightUnit === u ? " cx-on" : ""}`} onClick={() => habit({ weightUnit: u })}>{u === "t" ? "tonnes" : "kg"}</button>)}</span>}</div>
            <p className="cx-hint">Désignation, {volume ? "volume (m³)" : "quantité"}, prix unitaire et montant sont toujours imprimés. Une colonne non choisie, ou laissée vide, n’apparaît pas sur la facture.</p>
          </div>
          {draft.lines.map((l, k) => <fieldset key={l.id} className="cx-line">
            <legend>Article {k + 1}</legend>
            <div className="cx-line-grid">
              {cols.contract && <Field label="N° de contrat" optional wide><TextInput value={l.contract} onChange={v => setLine(l.id, { contract: v })} placeholder="Ex. D091/26 ; FAD 13971 TAL P2" /></Field>}
              <Field label="Désignation" required hint="Plusieurs lignes possibles (ex. numéros de conteneurs)."><TextArea rows={3} value={l.designation} onChange={v => setLine(l.id, { designation: v })} placeholder={"Traitement phytosanitaire\nConteneur MSNU 923173-6"} /></Field>
              {cols.destination && <Field label="Destination" optional><TextArea rows={3} value={l.destination} onChange={v => setLine(l.id, { destination: v })} placeholder={"Kolkata\nNorfolk"} /></Field>}
              <Field label={measureName(draft.measure)} required hint="Décimales possibles : 19,245"><NumberInput decimals value={l.quantity} onChange={v => setLine(l.id, { quantity: v })} placeholder={volume ? "0,000" : "1"} unit={volume ? "m³" : undefined} /></Field>
              <Field label={volume ? "Prix unitaire HT, par m³" : "Prix unitaire hors taxe"} required><MoneyInput value={l.unitPrice} onChange={v => setLine(l.id, { unitPrice: v })} /></Field>
              {cols.lot && <Field label="N° de lot" optional><TextInput value={l.lot ?? ""} onChange={v => setLine(l.id, { lot: v })} placeholder="Ex. LOT 24-118" /></Field>}
              {cols.weight && <Field label={`Poids (${unitOf(draft.weightUnit)})`} optional hint="Décimales possibles"><NumberInput decimals value={l.weight ?? 0} onChange={v => setLine(l.id, { weight: v || undefined })} unit={unitOf(draft.weightUnit)} /></Field>}
            </div>
            <div className="cx-line-foot">
              <div>{draft.lines.length > 1 && <button type="button" className="cx-btn cx-btn-link cx-inline cx-quiet-link" onClick={() => set({ lines: draft.lines.filter(x => x.id !== l.id) })}><Trash2 size={14} /> Retirer cet article</button>}</div>
              <span>{decimalLabel(l.quantity)}{volume ? " m³" : ""} × {money(l.unitPrice)} = <strong>{money(lineAmount(l))}</strong></span>
            </div>
          </fieldset>)}
          <Button icon={<Plus size={18} />} onClick={() => set({ lines: [...draft.lines, emptyLine()] })}>Ajouter un article</Button>
        </div>}
        {step === 2 && <div className="cx-card">
          <div className="cx-section-title"><h2>Remise, TVA et règlement</h2></div>
          <div className="cx-form-grid">
            <Field label="Remise" hint="0 si aucune remise."><NumberInput value={draft.discountRate} onChange={v => set({ discountRate: v })} decimals unit="%" /></Field>
            {draft.taxMode === "ttc" ? <Field label="TVA" hint="Taux appliqué après la remise."><NumberInput value={draft.taxRate} onChange={v => set({ taxRate: v })} decimals unit="%" /></Field>
              : <Field label="TVA"><div className="cx-static">Aucune, facture hors taxe <button type="button" className="cx-btn cx-btn-link cx-inline" onClick={() => { set({ taxMode: "ttc", taxRate: draft.taxRate || 19.25 }); }}>Passer en TTC</button></div></Field>}
            <Field label="Avance versée à la facturation" hint={`Maximum : ${money(totals.ttc)}`}><MoneyInput value={draft.advance} onChange={v => set({ advance: v })} /></Field>
          </div>
          <Field label="Mode de règlement"><Choice columns={5} value={draft.payment} onChange={v => set({ payment: v })} options={[...(draft.payment && !METHODS.includes(draft.payment) ? [{ value: draft.payment, label: draft.payment, sub: "ancien mode" }] : []), ...METHODS.map(m => ({ value: m, label: m }))]} /></Field>
          <Field label="Délai de paiement" hint={`Usage interne, jamais imprimé sur la facture. Échéance le ${dateValid(draft.date) && Number.isSafeInteger(draft.paymentTerm) ? dateFr(addDays(draft.date, draft.paymentTerm)) : "—"}.`}><NumberInput value={draft.paymentTerm} onChange={v => set({ paymentTerm: v })} unit="jours" /></Field>
          <Field label="Note sur la facture" optional><TextArea rows={2} value={draft.note} onChange={v => set({ note: v })} /></Field>
        </div>}
        {step === 3 && chosen && <div className="cx-review">
          <div className="cx-card cx-recap">
            <h3>Récapitulatif</h3>
            <p><span>Client</span><strong>{chosen.name}</strong></p>
            <p><span>Numéro</span><strong>{number}</strong></p>
            <p><span>Date</span><strong>{dateFr(draft.date)}</strong></p>
            {draft.reference.trim() && <p><span>Référence</span><strong>{draft.reference.trim()}</strong></p>}
            {draft.purchaseOrder && <p><span>Bon de commande</span><strong>{draft.purchaseOrder}</strong></p>}
            <p><span>Type</span><strong>{draft.taxMode === "ttc" ? `TTC, TVA ${String(draft.taxRate).replace(".", ",")} %` : "Hors taxe"}</strong></p>
            <p><span>Calcul</span><strong>{volume ? "Volume (m³) × prix unitaire" : "Quantité × prix unitaire"}</strong></p>
            <p><span>Articles</span><strong>{draft.lines.filter(l => l.designation.trim()).length}</strong></p>
            {draft.discountRate > 0 && <p><span>Remise</span><strong>{String(draft.discountRate).replace(".", ",")} %, soit − {money(totals.discount)}</strong></p>}
            {draft.advance > 0 && <p><span>Avance reçue</span><strong>{money(draft.advance)}</strong></p>}
            <p><span>Mode de règlement</span><strong>{draft.payment || "À choisir"}</strong></p>
            <p><span>Échéance (interne)</span><strong>{dateFr(addDays(draft.date, draft.paymentTerm))}, {draft.paymentTerm} jours</strong></p>
            <div className="cx-summary-total"><span>{draft.advance > 0 ? "Reste à payer" : totals.totalLabel}</span><strong>{money(totals.due)}</strong></div>
            {editing && balance(editing, d.payments, d.credits).received > 0 && <p className="cx-muted">Paiements déjà reçus sur cette facture : {money(balance(editing, d.payments, d.credits).received)}.</p>}
          </div>
          <Paper invoice={{ ...(editing ?? {} as Invoice), id: editing?.id ?? "draft", number, date: draft.date, client: chosen, company: editing?.company ?? d.company, lines: draft.lines.filter(l => l.designation.trim()), taxRate: draft.taxRate, taxMode: draft.taxMode, discountRate: draft.discountRate, advance: draft.advance, payment: draft.payment, note: draft.note, purchaseOrder: draft.purchaseOrder, reference: draft.reference.trim() || undefined, measure: draft.measure, columns: cols, weightUnit: draft.weightUnit }} title="Aperçu avant émission" />
        </div>}
      </div>
      {step < 3 && summary}
    </div>
    <footer className="cx-wizard-foot cx-noprint">
      <Button kind="quiet" icon={step ? <ChevronLeft size={18} aria-hidden="true" /> : undefined} onClick={() => step ? (setStep(step - 1), setError("")) : onCancel()}>{step ? "Étape précédente" : "Annuler"}</Button>
      {step < 3 ? <Button kind="primary" onClick={next}>Continuer</Button>
        : <Button kind="primary" icon={<FileText size={18} />} onClick={save}>{editing ? "Enregistrer les modifications" : legacy ? `Enregistrer l’ancienne facture n° ${number}` : `Émettre la facture n° ${number}`}</Button>}
    </footer>
    {form && <ClientForm client={form} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); pickClient(c.id); }} />}
  </section>;
}
