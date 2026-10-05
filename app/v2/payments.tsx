import { useState } from "react";
import { Lock } from "lucide-react";
import { creditSelection, quantityLabel, invoiceTotals as invoiceTotalsOf } from "../invoice-math";
import { fixedModel } from "../invoice-format";
import { modelFormat } from "../invoice-paper";
import { Button, Choice, Confirm, DateInput, Field, Modal, MoneyInput, Notice, NumberInput, SearchBox, TextArea, TextInput, matches, toast } from "./ui";
import { METHODS, REFERENCE_HINT, accountName, balance, commit, dateFr, dateValid, daysSince, getData, methodName, money, nextCreditNumber, nowIso, todayIso, uid, useData } from "./store";
import type { CreditNote, Payment } from "./store";

/** Record or correct a payment. Same rules as the first prototype, plus a duplicate warning. */
export function PaymentModal({ invoiceId, paymentId, requestId, by, onClose }: { invoiceId: string; paymentId?: string; requestId?: string; by: string; onClose: () => void }) {
  const d = useData(), previous = d.payments.find(p => p.id === paymentId), req = d.requests.find(r => r.id === requestId);
  const [invId, setInvId] = useState(previous?.invoiceId ?? invoiceId);
  const invoice = d.invoices.find(i => i.id === invId)!;
  const [amount, setAmount] = useState(previous?.amount ?? req?.amount ?? 0), [date, setDate] = useState(previous?.date ?? req?.paymentDate ?? todayIso());
  const [method, setMethod] = useState(previous?.method ?? req?.method ?? (METHODS.includes(invoice.payment) ? invoice.payment : "Espèces")), [reference, setReference] = useState(previous?.reference ?? req?.reference ?? "");
  const [error, setError] = useState(""), [sure, setSure] = useState(false);
  const others = d.payments.filter(p => p.id !== paymentId), limit = balance(invoice, others, d.credits).due;
  const available = d.invoices.filter(i => i.client.id === invoice.client.id && balance(i, d.payments, d.credits).due > 0);
  const dup = !previous && amount > 0 && d.payments.find(p => p.invoiceId === invoice.id && !p.cancelledAt && p.amount === amount && p.method === method && Math.abs(daysSince(p.date) - daysSince(date || todayIso())) <= 7);
  function save() {
    const cur = getData(), prev = paymentId ? cur.payments.find(p => p.id === paymentId) : undefined;
    if (paymentId && (!prev || prev.cancelledAt || prev.lockedAt || prev.invoiceId !== invoice.id)) return setError("Ce paiement ne peut plus être modifié.");
    if (!Number.isSafeInteger(amount) || amount <= 0) return setError("Saisissez un montant supérieur à zéro.");
    if (amount > limit) return setError(`Ce montant dépasse le montant encore payable sur cette facture (${money(limit)}).`);
    if (!dateValid(date)) return setError("Choisissez une date de paiement valide.");
    if (date > todayIso()) return setError("La date du paiement ne peut pas être dans le futur.");
    if (dup && !sure) return setError("Confirmez qu’il s’agit bien d’un autre paiement.");
    const stamp = nowIso();
    const entry: Payment = { ...(prev ?? {}), id: prev?.id ?? uid(), invoiceId: invoice.id, amount, date, method, reference: reference.trim(), by: prev?.by ?? by, at: prev?.at ?? stamp,
      ...(prev ? { revisedAt: stamp, history: [...(prev.history ?? []), { amount: prev.amount, date: prev.date, method: prev.method, reference: prev.reference, savedAt: stamp, by }] } : {}) };
    commit(by, x => ({ payments: prev ? x.payments.map(p => p.id === prev.id ? entry : p) : [...x.payments, entry],
      requests: req ? x.requests.map(r => r.id === req.id ? { ...r, readAt: r.readAt ?? stamp, resolvedAt: stamp, resolvedBy: by, linkedId: entry.id, response: `Paiement enregistré : ${money(amount)} par ${methodName(method)} le ${dateFr(date)}.` } : r) : x.requests }),
      { text: prev ? `Paiement corrigé : ${money(prev.amount)} → ${money(amount)} (${methodName(method)})` : `Paiement de ${money(amount)} par ${methodName(method)} sur ${invoice.number}`, clientId: invoice.client.id, invoiceId: invoice.id });
    toast(`${prev ? "Paiement corrigé" : "Paiement enregistré"}. Reste à payer sur ${invoice.number} : ${money(balance(invoice, getData().payments, getData().credits).due)}.`);
    onClose();
  }
  return <Modal side title={previous ? "Modifier le paiement" : "Enregistrer un paiement"} subtitle={`${invoice.client.name}, facture ${invoice.number}`} onClose={onClose}
    actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={save}>{previous ? "Enregistrer la correction" : amount ? `Enregistrer le paiement de ${money(amount)}` : "Enregistrer le paiement"}</Button></>}>
    <form onSubmit={e => { e.preventDefault(); save(); }}>
      {req && <Notice title="Demande du responsable">{req.message || "Paiement signalé."} Les champs reprennent ce qu’il a signalé : vérifiez-les avec le relevé.</Notice>}
      {!previous && available.length > 1 && <Field label="Pour quelle facture ?"><Choice columns={2} value={invId} onChange={v => { setInvId(v); setError(""); }} options={available.map(i => ({ value: i.id, label: i.number, sub: `reste ${money(balance(i, d.payments, d.credits).due)}` }))} /></Field>}
      <div className="cx-due-box"><span>{previous ? "Montant maximum pour ce paiement" : "Il reste à payer"}</span><strong>{money(limit)}</strong></div>
      {previous && <p className="cx-hint">Le nouveau montant remplacera l’ancien. La correction est conservée dans l’historique.</p>}
      <Field label={previous ? "Montant corrigé" : "Combien avez-vous reçu ?"} required><MoneyInput value={amount} onChange={v => { setAmount(v); setError(""); }} autoFocus /></Field>
      <button type="button" className="cx-btn cx-btn-link cx-inline cx-fill" onClick={() => { setAmount(limit); setError(""); }}>{previous ? "Régler entièrement cette facture" : `Le client a payé tout le reste (${money(limit)})`}</button>
      <div className="cx-form-grid">
        <Field label="Date du paiement" required><DateInput value={date} max={todayIso()} onChange={v => { setDate(v); setError(""); }} /></Field>
        <Field label="Référence ou note" optional hint={REFERENCE_HINT[method]}><TextInput value={reference} onChange={setReference} placeholder={REFERENCE_HINT[method]} /></Field>
      </div>
      <Field label="Comment a-t-il payé ?" required><Choice columns={5} value={method} onChange={v => { setMethod(v); setError(""); }} options={[...(!METHODS.includes(method) ? [{ value: method, label: method, sub: "ancien mode" }] : []), ...METHODS.map(m => ({ value: m, label: m }))]} /></Field>
      {dup && <Notice tone="warn" title="Ce paiement ressemble à un paiement déjà saisi">{money(dup.amount)} par {methodName(dup.method)} le {dateFr(dup.date)}, saisi par {accountName(dup.by)}.
        <label className="cx-confirm"><input type="checkbox" checked={sure} onChange={e => { setSure(e.target.checked); setError(""); }} /> C’est bien un autre paiement</label></Notice>}
      {amount > 0 && amount <= limit && <div className="cx-after">Après {previous ? "correction" : "ce paiement"}, il restera <strong>{money(limit - amount)}</strong></div>}
      {error && <Notice tone="bad">{error}</Notice>}
      <button type="submit" hidden />
    </form>
  </Modal>;
}

export function CancelPayment({ payment, by, onClose }: { payment: Payment; by: string; onClose: () => void }) {
  const d = getData(), i = d.invoices.find(x => x.id === payment.invoiceId);
  return <Confirm title="Annuler ce paiement saisi par erreur ?" confirm="Annuler ce paiement" cancel="Garder le paiement" onClose={onClose} onConfirm={() => {
    if (getData().payments.find(p => p.id === payment.id)?.lockedAt) { toast("Ce paiement est validé et verrouillé.", "warn"); onClose(); return; }
    commit(by, x => ({ payments: x.payments.map(p => p.id === payment.id ? { ...p, cancelledAt: nowIso(), cancelledBy: by } : p) }), { text: `Paiement de ${money(payment.amount)} annulé (saisie erronée), reste visible`, clientId: i?.client.id, invoiceId: payment.invoiceId });
    toast("Paiement annulé. Le compte client a été mis à jour."); onClose();
  }}><p>{money(payment.amount)}, {methodName(payment.method)}, {dateFr(payment.date)}, facture {i?.number}.</p><p className="cx-muted">Le montant sera retiré des paiements reçus et le reste à payer recalculé. L’entrée restera visible comme annulée.</p></Confirm>;
}
export function LockBadge() { return <span className="cx-chip cx-tone-good"><Lock size={12} /> Validé, verrouillé</span>; }

/** Credit note on an invoice, by articles or by amount (first prototype rules). */
export function CreditModal({ invoiceId, by, onClose, onIssued }: { invoiceId: string; by: string; onClose: () => void; onIssued: (creditId: string) => void }) {
  const d = useData(), invoice = d.invoices.find(i => i.id === invoiceId)!;
  const [mode, setMode] = useState<"articles" | "amount">("articles"), [quantities, setQuantities] = useState<Record<string, number>>({}), [amount, setAmount] = useState(0), [reason, setReason] = useState(""), [date, setDate] = useState(todayIso()), [error, setError] = useState("");
  const selected = creditSelection(invoice, d.credits, quantities), b = balance(invoice, d.payments, d.credits), value = mode === "articles" ? selected.amount : amount;
  function issue() {
    if (mode === "articles" && (!selected.lines.length || Object.entries(quantities).some(([id, q]) => !Number.isFinite(q) || q <= 0 || q > (selected.available.find((l: { id: string; remaining: number }) => l.id === id)?.remaining ?? 0)))) return setError("Choisissez au moins un article avec une quantité disponible.");
    if (!Number.isSafeInteger(value) || value <= 0 || value > b.total - b.credited) return setError("Le montant doit être positif et ne pas dépasser le montant encore facturé.");
    if (!reason.trim()) return setError("Indiquez le motif de l’avoir.");
    if (!dateValid(date) || date < invoice.date) return setError("Choisissez une date égale ou postérieure à celle de la facture.");
    const period = date.slice(0, 7); if (d.closedMonths.includes(period)) return setError("Ce mois est clôturé.");
    const original = invoiceTotalsOf(invoice), previous = d.credits.filter(c => c.invoiceId === invoice.id), remainingHt = original.ht - previous.reduce((n, c) => n + c.ht, 0), remainingTax = original.tax - previous.reduce((n, c) => n + c.tax, 0);
    const ht = mode === "articles" ? selected.ht : Math.max(0, value - remainingTax, Math.min(remainingHt, Math.round(value / (1 + (original.taxMode === "ttc" ? invoice.taxRate : 0) / 100))));
    const credit: CreditNote = { id: uid(), invoiceId: invoice.id, number: nextCreditNumber(getData(), period), date, amount: value, ht, tax: value - ht, taxRate: invoice.taxRate, taxMode: original.taxMode, lines: mode === "articles" ? selected.lines : undefined, reason: reason.trim(), invoiceNumber: invoice.number, invoiceDate: invoice.date, client: { ...invoice.client }, company: { ...invoice.company, logo: "" }, format: modelFormat((invoice.template as { document?: unknown } | undefined)?.document ?? fixedModel(d.format)) };
    commit(by, x => ({ credits: [...x.credits, credit], month: period }), { text: `Avoir ${credit.number} de ${money(value)} sur ${invoice.number}, ${credit.reason}`, clientId: invoice.client.id, invoiceId: invoice.id });
    toast("Avoir enregistré. Le compte client a été mis à jour."); onIssued(credit.id);
  }
  return <Modal side wide title="Créer une facture d’avoir" subtitle={`${invoice.client.name}, facture ${invoice.number}`} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={issue}>Émettre l’avoir{value ? ` de ${money(value)}` : ""}</Button></>}>
    <div className="cx-due-box"><span>Facture de référence : {invoice.number}</span><strong>{money(b.total - b.credited)} encore facturés</strong></div>
    <Field label="Que souhaitez-vous déduire ?"><Choice value={mode} onChange={v => { setMode(v); setError(""); }} options={[{ value: "articles", label: "Des articles", sub: "Choisir les lignes et quantités" }, { value: "amount", label: "Un montant", sub: "Saisir une somme" }]} /></Field>
    {mode === "articles" ? <div className="cx-credit-lines">{selected.available.map((l: { id: string; remaining: number; designation?: string }) => { const line = invoice.lines.find(x => x.id === l.id)!; const on = Object.hasOwn(quantities, l.id); return <div key={l.id} className={`cx-credit-line${on ? " cx-on" : ""}`}>
      <label><input type="checkbox" checked={on} disabled={l.remaining <= 0} onChange={e => { const n = { ...quantities }; if (e.target.checked) n[l.id] = l.remaining; else delete n[l.id]; setQuantities(n); setError(""); }} /><span><strong>{line.designation}</strong>{line.destination && <small>{line.destination}</small>}<small>{quantityLabel(l.remaining)} disponible{l.remaining > 1 ? "s" : ""} pour l’avoir</small></span></label>
      {on && <Field label="Quantité à déduire"><NumberInput value={quantities[l.id]} onChange={v => setQuantities({ ...quantities, [l.id]: v })} /></Field>}
    </div>; })}<p className="cx-hint">La remise et la TVA de la facture d’origine sont reprises dans le calcul.</p></div>
      : <Field label="Montant à déduire" required hint={`Maximum : ${money(b.total - b.credited)}`}><MoneyInput value={amount} onChange={v => { setAmount(v); setError(""); }} autoFocus /></Field>}
    <Field label="Motif de l’avoir" required><TextArea rows={3} value={reason} onChange={v => { setReason(v); setError(""); }} placeholder={`Ex. Avoir sur la référence ${invoice.number} : annulation du traitement à Norfolk`} /></Field>
    <Field label="Date de l’avoir" required><DateInput value={date} min={invoice.date} onChange={setDate} /></Field>
    <div className="cx-after"><span>Montant de l’avoir : <strong>{money(value)}</strong></span><span>Reste à payer après l’avoir : <strong>{money(Math.max(0, b.due - value))}</strong></span>{value > b.due && <span>À restituer : <strong>{money(b.refund + value - b.due)}</strong></span>}</div>
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}
export function CreditPicker({ onPick, onClose }: { onPick: (invoiceId: string) => void; onClose: () => void }) {
  const d = useData(), [q, setQ] = useState("");
  const eligible = d.invoices.filter(i => { const b = balance(i, d.payments, d.credits); return b.credited < b.total; }).filter(i => matches(q, i.number, i.client.name)).sort((a, b) => b.date.localeCompare(a.date));
  return <Modal side title="Quelle facture voulez-vous corriger ?" subtitle="Choisissez la facture d’origine." onClose={onClose}>
    <SearchBox value={q} onChange={setQ} placeholder="Nom du client ou numéro…" autoFocus />
    <div className="cx-pick-list">{eligible.map(i => { const b = balance(i, d.payments, d.credits); return <button type="button" key={i.id} onClick={() => onPick(i.id)}><span><strong>{i.client.name}</strong><small>{i.number}, {dateFr(i.date)}</small></span><span className="cx-pick-amount"><strong>{money(b.total - b.credited)}</strong><small>encore facturé</small></span></button>; })}
      {!eligible.length && <p className="cx-muted">Aucune facture trouvée. Essayez un autre nom ou numéro.</p>}</div>
  </Modal>;
}
