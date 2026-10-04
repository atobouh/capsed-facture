import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Pencil, Plus, Printer, Truck, UserPlus } from "lucide-react";
import { invoiceTotals, lineAmount } from "../invoice-math";
import { words } from "./words";
import { Button, Choice, Empty, Field, InvoicePaper, MoreMenu, Notice, NumberInput, MoneyInput, SearchBox, Stat, StatusChip, TextInput, Timeline, Wizard, matches, toast } from "./ui";
import { ClientForm, InvoiceRow, PaymentLine, RequestCard, RequestModal, Row, pendingRequest } from "./shared";
import { METHODS, commit, dateFr, emptyClient, emptyLine, getData, invoiceBalance, invoiceStatus, liveInvoices, money, nextInvoiceNumber, nowIso, todayIso, uid, useData } from "./store";
import type { Client, Data, Invoice, Line, RequestKind } from "./store";

export type FRoute = { name: "factures" | "facture" | "nouvelle" | "clients" | "client" | "remises" | "demandes"; id?: string; filter?: string };
type Nav = (r: FRoute) => void;
const ME = "u-awa";

export function FacturationScreen({ route, nav }: { route: FRoute; nav: Nav }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); nav({ name: "nouvelle" }); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [nav]);
  switch (route.name) {
    case "nouvelle": return <InvoiceWizard key={route.id ?? "new"} draftId={route.id} clientId={route.filter} nav={nav} />;
    case "facture": return <InvoicePage id={route.id!} nav={nav} />;
    case "clients": return <ClientsPage nav={nav} />;
    case "client": return <ClientPage id={route.id!} nav={nav} />;
    case "remises": return <DeliveryPage nav={nav} />;
    case "demandes": return <MyRequests />;
    default: return <InvoicesHome nav={nav} filter={route.filter} />;
  }
}

function InvoicesHome({ nav, filter: initial }: { nav: Nav; filter?: string }) {
  const d = useData(), [q, setQ] = useState(""), [filter, setFilter] = useState(initial ?? "tout");
  const today = todayIso();
  const drafts = d.invoices.filter(i => i.status === "brouillon" && !i.abandonedAt);
  const toDeliver = liveInvoices(d).filter(i => i.status === "emise" && !i.delivery);
  const todays = liveInvoices(d).filter(i => i.date === today);
  const list = (filter === "brouillons" ? drafts : filter === "remettre" ? toDeliver : filter === "jour" ? todays : filter === "abandonnes" ? d.invoices.filter(i => i.abandonedAt) : liveInvoices(d))
    .filter(i => matches(q, i.number, i.client.name)).sort((a, b) => (b.issuedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.createdAt));
  return <div className="cx-page">
    <header className="cx-page-head"><div><h1>Factures</h1><p>Bonjour Awa. Que voulez-vous faire ?</p></div><Button kind="primary" icon={<FilePlus2 size={20} />} onClick={() => nav({ name: "nouvelle" })}>Nouvelle facture</Button></header>
    <div className="cx-tiles">
      <button type="button" className="cx-tile" onClick={() => setFilter("jour")}><strong>{todays.length}</strong><span>émise{todays.length > 1 ? "s" : ""} aujourd’hui</span></button>
      <button type="button" className={`cx-tile${toDeliver.length ? " cx-tile-warn" : ""}`} onClick={() => nav({ name: "remises" })}><strong>{toDeliver.length}</strong><span>à remettre au client</span></button>
      <button type="button" className="cx-tile" onClick={() => setFilter("brouillons")}><strong>{drafts.length}</strong><span>brouillon{drafts.length > 1 ? "s" : ""} à terminer</span></button>
    </div>
    <SearchBox value={q} onChange={setQ} placeholder="Chercher un numéro de facture ou un client" />
    <div className="cx-filters" role="tablist">{[["tout", "Toutes"], ["jour", "Aujourd’hui"], ["remettre", "À remettre"], ["brouillons", "Brouillons"], ["abandonnes", "Brouillons abandonnés"]].map(([k, l]) => <button type="button" role="tab" aria-selected={filter === k} key={k} className={filter === k ? "cx-on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
    <div className="cx-list">{list.length ? list.map(i => <InvoiceRow key={i.id} i={i} d={d} onClick={() => nav(i.status === "brouillon" && !i.abandonedAt ? { name: "nouvelle", id: i.id } : { name: "facture", id: i.id })} />)
      : <Empty title={q ? "Aucune facture ne correspond." : "Rien ici pour l’instant."}>{q ? "Vérifiez l’orthographe ou cherchez par numéro." : null}</Empty>}</div>
  </div>;
}

function blankInvoice(d: Data, clientId?: string): Invoice {
  const c = d.clients.find(x => x.id === clientId);
  return { id: uid(), number: null, status: "brouillon", date: todayIso(), clientId: c?.id ?? "", client: c ?? emptyClient(), company: d.company, lines: [emptyLine()], taxRate: 19.25, taxMode: "ttc", discountRate: 0, advance: 0, payment: "Virement", note: "", purchaseOrder: "", createdBy: ME, createdAt: nowIso() };
}

function InvoiceWizard({ draftId, clientId, nav }: { draftId?: string; clientId?: string; nav: Nav }) {
  const d = useData();
  const [inv, setInv] = useState<Invoice>(() => getData().invoices.find(i => i.id === draftId) ?? blankInvoice(getData(), clientId));
  const [step, setStep] = useState(inv.clientId ? 1 : 0), [tried, setTried] = useState(false), [issued, setIssued] = useState<Invoice | null>(null);
  const [q, setQ] = useState(""), [newClient, setNewClient] = useState<Client | null>(null);
  // Autosave the draft as soon as a client is chosen; drafts have no number and can be resumed.
  useEffect(() => {
    if (!inv.clientId || issued) return;
    const t = setTimeout(() => { const cur = getData(); if (cur.invoices.some(i => i.id === inv.id && i.status !== "brouillon")) return; commit(ME, dd => ({ invoices: dd.invoices.some(i => i.id === inv.id) ? dd.invoices.map(i => i.id === inv.id ? inv : i) : [inv, ...dd.invoices] })); }, 400);
    return () => clearTimeout(t);
  }, [inv, issued]);
  const t = invoiceTotals(inv);
  const lineErrors = (l: Line) => ({ designation: !l.designation.trim() ? "Décrivez la prestation." : "", quantity: !(l.quantity >= 1) ? "Au moins 1." : "", unitPrice: !(l.unitPrice > 0) ? "Indiquez le prix." : "" });
  const linesOk = inv.lines.every(l => Object.values(lineErrors(l)).every(e => !e));
  const previous = d.invoices.filter(i => i.clientId === inv.clientId && i.status === "emise");
  const usual = previous.length ? Math.max(...previous.map(i => invoiceTotals(i).ttc)) : 0;
  const number = nextInvoiceNumber(d, inv.date);
  const setLine = (id: string, patch: Partial<Line>) => setInv(v => ({ ...v, lines: v.lines.map(l => l.id === id ? { ...l, ...patch } : l) }));
  function pick(c: Client) {
    const last = d.invoices.filter(i => i.clientId === c.id && i.status === "emise").sort((a, b) => b.date.localeCompare(a.date))[0];
    setInv(v => ({ ...v, clientId: c.id, client: c, taxMode: last?.taxMode ?? v.taxMode, payment: last?.payment ?? v.payment })); setStep(1);
  }
  function issue() {
    const cur = getData(), n = nextInvoiceNumber(cur, inv.date), client = cur.clients.find(c => c.id === inv.clientId) ?? inv.client;
    const done: Invoice = { ...inv, client, number: n, status: "emise", issuedAt: nowIso() };
    commit(ME, dd => ({ invoices: dd.invoices.some(i => i.id === done.id) ? dd.invoices.map(i => i.id === done.id ? done : i) : [done, ...dd.invoices] }), { text: `Facture ${n} émise · ${money(invoiceTotals(done).ttc)}`, clientId: done.clientId, invoiceId: done.id });
    setIssued(done);
  }
  if (issued) return <div className="cx-page cx-success">
    <div className="cx-success-mark">✓</div>
    <h1>Facture {issued.number} émise</h1>
    <p className="cx-lead">{issued.client.name} · <strong>{money(invoiceTotals(issued).ttc)}</strong></p>
    <p className="cx-muted">Étape suivante : imprimez-la, puis déclarez sa remise au client.</p>
    <div className="cx-actions-center">
      <Button kind="primary" icon={<Printer size={20} />} onClick={() => { nav({ name: "facture", id: issued.id }); setTimeout(() => window.print(), 300); }}>Imprimer la facture</Button>
      <Button icon={<Truck size={20} />} onClick={() => nav({ name: "remises" })}>Déclarer la remise</Button>
      <Button kind="quiet" icon={<FilePlus2 size={20} />} onClick={() => nav({ name: "nouvelle", id: "n" + Date.now() })}>Nouvelle facture</Button>
    </div>
    <Button kind="link" onClick={() => nav({ name: "factures" })}>Retour aux factures</Button>
  </div>;
  const clients = d.clients.filter(c => !c.archivedAt && matches(q, c.name, c.niu, c.address, c.phone)).sort((a, b) => a.name.localeCompare(b.name));
  return <Wizard title="Nouvelle facture" steps={["Client", "Prestations", "Vérifier et émettre"]} step={step} onBack={() => setStep(s => s - 1)} onExit={() => nav({ name: "factures" })}
    next={step === 0 ? <Button kind="primary" disabled={!inv.clientId} onClick={() => setStep(1)}>Continuer</Button>
      : step === 1 ? <Button kind="primary" onClick={() => { setTried(true); if (linesOk) setStep(2); }}>Continuer : vérifier</Button>
      : <Button kind="primary" onClick={issue}>Émettre la facture n° {number}</Button>}>
    {step === 0 && <>
      <div className="cx-step-intro"><h2>Pour quel client ?</h2><p>Tapez les premières lettres, puis cliquez sur le client.</p></div>
      <div className="cx-search-row"><SearchBox value={q} onChange={setQ} placeholder="Nom, NIU, quartier ou téléphone" /><Button icon={<UserPlus size={20} />} onClick={() => setNewClient({ ...emptyClient(), name: q })}>Nouveau client</Button></div>
      <div className="cx-list">{clients.map(c => <Row key={c.id} onClick={() => pick(c)} aside={inv.clientId === c.id ? <span className="cx-chip cx-tone-good">Choisi</span> : undefined}><strong>{c.name}</strong><span className="cx-row-sub">{[c.niu && `NIU ${c.niu}`, c.address, c.phone].filter(Boolean).join(" · ")}</span></Row>)}
        {!clients.length && <Empty title="Aucun client ne correspond." action={<Button icon={<UserPlus size={20} />} onClick={() => setNewClient({ ...emptyClient(), name: q })}>Créer « {q} »</Button>} />}</div>
      {newClient && <ClientForm client={newClient} by={ME} onClose={() => setNewClient(null)} onSaved={c => { setNewClient(null); pick(c); }} />}
    </>}
    {step === 1 && <div className="cx-split">
      <div>
        <ChosenClient inv={inv} onChange={() => setStep(0)} />
        <div className="cx-step-intro"><h2>Qu’est-ce qui est facturé ?</h2><p>Une ligne par prestation. Le montant se calcule tout seul.</p></div>
        {inv.lines.map((l, k) => { const e = tried ? lineErrors(l) : { designation: "", quantity: "", unitPrice: "" }; return <fieldset key={l.id} className="cx-line">
          <legend>Ligne {k + 1}</legend>
          <div className="cx-line-grid">
            <div className="cx-span2"><Field label="Désignation" required error={e.designation}><TextInput value={l.designation} onChange={v => setLine(l.id, { designation: v })} placeholder="Ex. : Transport de marchandises" autoFocus={k === inv.lines.length - 1 && !l.designation} /></Field></div>
            <Field label="Destination" optional><TextInput value={l.destination} onChange={v => setLine(l.id, { destination: v })} /></Field>
            <Field label="N° de contrat" optional><TextInput value={l.contract} onChange={v => setLine(l.id, { contract: v })} /></Field>
            <Field label="Quantité" required error={e.quantity}><NumberInput value={l.quantity} onChange={v => setLine(l.id, { quantity: v })} min={1} /></Field>
            <Field label="Prix unitaire" required error={e.unitPrice}><MoneyInput value={l.unitPrice} onChange={v => setLine(l.id, { unitPrice: v })} /></Field>
          </div>
          <div className="cx-line-foot"><span>Montant de la ligne : <strong>{money(lineAmount(l))}</strong></span>{inv.lines.length > 1 && <button type="button" className="cx-btn cx-btn-link" onClick={() => setInv(v => ({ ...v, lines: v.lines.filter(x => x.id !== l.id) }))}>Retirer cette ligne du brouillon</button>}</div>
        </fieldset>; })}
        <Button icon={<Plus size={20} />} onClick={() => setInv(v => ({ ...v, lines: [...v.lines, emptyLine()] }))}>Ajouter une ligne</Button>
        <div className="cx-section"><Field label="TVA"><Choice value={inv.taxMode} onChange={v => setInv({ ...inv, taxMode: v })} options={[{ value: "ttc", label: "Avec TVA 19,25 %", sub: "Total TTC" }, { value: "ht", label: "Sans TVA", sub: "Total hors taxe" }]} /></Field></div>
        <div className="cx-section"><Field label="Mode de règlement prévu"><Choice columns={5} value={inv.payment} onChange={v => setInv({ ...inv, payment: v })} options={METHODS.map(m => ({ value: m, label: m }))} /></Field></div>
        <div className="cx-form-grid"><Field label="Bon de commande" optional><TextInput value={inv.purchaseOrder} onChange={v => setInv({ ...inv, purchaseOrder: v })} /></Field><Field label="Note sur la facture" optional><TextInput value={inv.note} onChange={v => setInv({ ...inv, note: v })} /></Field></div>
        <p className="cx-muted">Brouillon enregistré automatiquement. Vous pouvez quitter et reprendre plus tard. <button type="button" className="cx-btn cx-btn-link cx-inline" onClick={() => { commit(ME, dd => ({ invoices: dd.invoices.some(x => x.id === inv.id) ? dd.invoices.map(x => x.id === inv.id ? { ...inv, abandonedAt: nowIso() } : x) : [{ ...inv, abandonedAt: nowIso() }, ...dd.invoices] })); toast("Brouillon rangé dans « Brouillons abandonnés ». Vous pouvez le reprendre à tout moment."); nav({ name: "factures" }); }}>Abandonner ce brouillon</button></p>
      </div>
      <aside className="cx-totals"><h3>Total</h3>
        <p><span>Montant HT</span><strong>{money(t.ht)}</strong></p>
        {t.taxMode === "ttc" && <p><span>TVA 19,25 %</span><strong>{money(t.tax)}</strong></p>}
        <p className="cx-grand"><span>{t.totalLabel}</span><strong>{money(t.ttc)}</strong></p>
        <small>{t.ttc ? words(t.ttc) + " francs CFA" : ""}</small>
      </aside>
    </div>}
    {step === 2 && <div className="cx-split">
      <div>
        <div className="cx-step-intro"><h2>Vérifiez avant d’émettre</h2><p>Après émission, le numéro est définitif. Une erreur se corrige ensuite par un avoir.</p></div>
        <div className="cx-card cx-recap">
          <p><span>Client</span><strong>{inv.client.name}</strong></p>
          <p><span>Numéro</span><strong>{number}</strong></p>
          <p><span>Date</span><strong>{dateFr(inv.date)}</strong></p>
          <p><span>Prestations</span><strong>{inv.lines.length} ligne{inv.lines.length > 1 ? "s" : ""}</strong></p>
          <p><span>Règlement prévu</span><strong>{inv.payment}</strong></p>
          <p className="cx-grand"><span>{t.totalLabel}</span><strong>{money(t.ttc)}</strong></p>
        </div>
        {usual > 0 && t.ttc > usual * 3 && <Notice tone="warn" title="Montant inhabituel">Ce client n’a jamais eu de facture au-dessus de {money(usual)}. Vérifiez les quantités et les prix.</Notice>}
      </div>
      <InvoicePaper invoice={{ ...inv, number }} />
    </div>}
  </Wizard>;
}
function ChosenClient({ inv, onChange }: { inv: Invoice; onChange: () => void }) {
  return <div className="cx-chosen"><div><small>Client</small><strong>{inv.client.name}</strong><span>{[inv.client.niu && `NIU ${inv.client.niu}`, inv.client.address].filter(Boolean).join(" · ")}</span></div><Button kind="link" onClick={onChange}>Changer</Button></div>;
}

function InvoicePage({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), i = d.invoices.find(x => x.id === id), [ask, setAsk] = useState<Exclude<RequestKind, "verification"> | null>(null);
  if (!i) return <Empty title="Facture introuvable." action={<Button onClick={() => nav({ name: "factures" })}>Retour aux factures</Button>} />;
  const b = invoiceBalance(i, d), s = invoiceStatus(i, d), pending = pendingRequest(d, r => r.invoiceId === i.id);
  const pays = d.payments.filter(p => p.invoiceId === i.id), credits = d.credits.filter(c => c.invoiceId === i.id);
  const more = i.abandonedAt ? [{ label: "Reprendre ce brouillon", onClick: () => { commit(ME, dd => ({ invoices: dd.invoices.map(x => x.id === i.id ? { ...x, abandonedAt: undefined } : x) })); nav({ name: "nouvelle", id: i.id }); } }]
    : i.status === "emise" && !pending ? [
      { label: "Demander un avoir", hint: "Pour retirer une partie du montant", onClick: () => setAsk("avoir") },
      { label: "Demander l’annulation", hint: "Facture émise par erreur ; le numéro est conservé", onClick: () => setAsk("annulation") },
    ] : [];
  return <div className="cx-page">
    <button type="button" className="cx-back cx-noprint" onClick={() => nav({ name: "factures" })}>← Factures</button>
    <header className="cx-page-head cx-noprint">
      <div><h1>Facture {i.number ?? "brouillon"} <StatusChip status={s} /></h1><p>{i.client.name} · {dateFr(i.date)}</p></div>
      <div className="cx-head-actions">
        <MoreMenu items={more} />
        {i.status === "emise" && !i.delivery && <Button icon={<Truck size={20} />} onClick={() => nav({ name: "remises" })}>Déclarer la remise</Button>}
        {i.status !== "brouillon" && <Button kind="primary" icon={<Printer size={20} />} onClick={() => window.print()}>Imprimer</Button>}
      </div>
    </header>
    {pending && <div className="cx-noprint"><Notice tone="warn" title="Demande en attente">Une demande « {pending.reason} » a été envoyée au responsable le {dateFr(pending.at)}.</Notice></div>}
    {i.status === "annulee" && <div className="cx-noprint"><Notice tone="bad" title="Facture annulée">Raison : {i.annulled?.reason}. Le numéro reste dans la suite des factures.</Notice></div>}
    <div className="cx-split cx-split-wide">
      <InvoicePaper invoice={i} />
      <aside className="cx-side cx-noprint">
        <div className="cx-stats"><Stat label="Montant" value={money(b.total)} /><Stat label="Reçu" value={money(b.received)} tone={b.received ? "good" : undefined} /><Stat label="Reste à payer" value={money(b.due)} tone={b.due ? "warn" : "good"} /></div>
        <section className="cx-card"><h3>Remise au client</h3>{i.delivery ? <p>Remise le {dateFr(i.delivery.date)} ({i.delivery.how.toLowerCase()}), reçue par <strong>{i.delivery.receivedBy}</strong>.</p> : <p className="cx-muted">Pas encore remise.</p>}</section>
        <section className="cx-card"><h3>Paiements</h3>{pays.length ? <div className="cx-list cx-list-tight">{pays.map(p => <PaymentLine key={p.id} p={p} d={d} />)}</div> : <p className="cx-muted">Aucun paiement.</p>}
          {credits.map(c => <p key={c.id}>Avoir {c.number} : − {money(c.amount)} ({c.reason})</p>)}</section>
        <section className="cx-card"><h3>Historique</h3><Timeline events={d.events.filter(e => e.invoiceId === i.id)} /></section>
      </aside>
    </div>
    {ask && <RequestModal kind={ask} by={ME} invoice={i} client={i.client} onClose={() => setAsk(null)} />}
  </div>;
}

function DeliveryPage({ nav }: { nav: Nav }) {
  const d = useData(), waiting = liveInvoices(d).filter(i => i.status === "emise" && !i.delivery).sort((a, b) => a.date.localeCompare(b.date));
  const [sel, setSel] = useState<string[]>([]), [how, setHow] = useState(""), [who, setWho] = useState(""), [date, setDate] = useState(todayIso()), [tried, setTried] = useState(false);
  const chosen = waiting.filter(i => sel.includes(i.id));
  const errors = { sel: tried && !chosen.length ? "Cochez au moins une facture." : "", how: tried && !how ? "Choisissez comment elle a été remise." : "", who: tried && !who.trim() ? (how === "Envoyée par e-mail" ? "Indiquez l’adresse e-mail." : "Indiquez qui l’a reçue.") : "" };
  function save() {
    setTried(true); if (!chosen.length || !how || !who.trim()) return;
    const at = nowIso();
    commit(ME, dd => ({ invoices: dd.invoices.map(i => sel.includes(i.id) ? { ...i, delivery: { at, by: ME, how, receivedBy: who.trim(), date } } : i), events: [...chosen.map(i => ({ id: uid(), at, by: ME, text: `Facture ${i.number} remise au client (${how.toLowerCase()}, ${who.trim()})`, clientId: i.clientId, invoiceId: i.id })), ...dd.events] }));
    toast(`${chosen.length} facture${chosen.length > 1 ? "s déclarées remises" : " déclarée remise"} : ${chosen.map(i => i.number).join(", ")}.`);
    setSel([]); setWho(""); setHow(""); setTried(false);
  }
  return <div className="cx-page">
    <header className="cx-page-head"><div><h1>Remises au client</h1><p>Cochez les factures données au client, puis dites comment.</p></div></header>
    {!waiting.length ? <Empty title="Toutes les factures émises ont été remises." action={<Button onClick={() => nav({ name: "factures" })}>Voir les factures</Button>} /> : <div className="cx-split">
      <div>
        {errors.sel && <p className="cx-error" role="alert">{errors.sel}</p>}
        <div className="cx-list">{waiting.map(i => <label key={i.id} className={`cx-row cx-check-row${sel.includes(i.id) ? " cx-on" : ""}`}>
          <input type="checkbox" checked={sel.includes(i.id)} onChange={e => setSel(s => e.target.checked ? [...s, i.id] : s.filter(x => x !== i.id))} />
          <div className="cx-row-main"><strong>{i.number} · {i.client.name}</strong><span className="cx-row-sub">Émise le {dateFr(i.date)} · {money(invoiceBalance(i, d).total)}</span></div>
        </label>)}</div>
      </div>
      <aside className="cx-card cx-side-form">
        <Field label="Comment ?" required error={errors.how}><Choice value={how} onChange={setHow} options={[{ value: "En main propre", label: "En main propre" }, { value: "Déposée chez le client", label: "Déposée chez le client" }, { value: "Envoyée par e-mail", label: "Envoyée par e-mail" }]} /></Field>
        <Field label={how === "Envoyée par e-mail" ? "Envoyée à (adresse e-mail)" : "Reçue par (nom)"} required error={errors.who}><TextInput value={who} onChange={setWho} /></Field>
        <Field label="Date de remise"><input className="cx-input" type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value || todayIso())} /></Field>
        <Button kind="primary" wide onClick={save}>{chosen.length ? `Déclarer ${chosen.length} facture${chosen.length > 1 ? "s" : ""} remise${chosen.length > 1 ? "s" : ""}` : "Déclarer la remise"}</Button>
        <p className="cx-muted">La « réception confirmée » viendra plus tard avec une copie tamponnée.</p>
      </aside>
    </div>}
  </div>;
}

function ClientsPage({ nav }: { nav: Nav }) {
  const d = useData(), [q, setQ] = useState(""), [archived, setArchived] = useState(false), [form, setForm] = useState<Client | null>(null);
  const list = d.clients.filter(c => !!c.archivedAt === archived && matches(q, c.name, c.niu, c.phone, c.address)).sort((a, b) => a.name.localeCompare(b.name));
  const count = d.clients.filter(c => c.archivedAt).length;
  return <div className="cx-page">
    <header className="cx-page-head"><div><h1>Clients</h1><p>{d.clients.length - count} clients actifs</p></div><Button kind="primary" icon={<UserPlus size={20} />} onClick={() => setForm(emptyClient())}>Nouveau client</Button></header>
    <SearchBox value={q} onChange={setQ} placeholder="Chercher un client par nom, NIU ou téléphone" />
    {count > 0 && <div className="cx-filters"><button type="button" className={!archived ? "cx-on" : ""} onClick={() => setArchived(false)}>Actifs</button><button type="button" className={archived ? "cx-on" : ""} onClick={() => setArchived(true)}>Archivés ({count})</button></div>}
    <div className="cx-list">{list.map(c => { const due = liveInvoices(d).filter(i => i.clientId === c.id && i.status === "emise").reduce((s, i) => s + invoiceBalance(i, d).due, 0); return <Row key={c.id} onClick={() => nav({ name: "client", id: c.id })} aside={due ? <><small>reste à payer</small><strong className="cx-amount">{money(due)}</strong></> : <span className="cx-chip cx-tone-good">À jour</span>}><strong>{c.name}</strong><span className="cx-row-sub">{[c.niu && `NIU ${c.niu}`, c.phone].filter(Boolean).join(" · ")}</span></Row>; })}
      {!list.length && <Empty title="Aucun client ne correspond." />}</div>
    {form && <ClientForm client={form} by={ME} onClose={() => setForm(null)} onSaved={c => { setForm(null); nav({ name: "client", id: c.id }); }} />}
  </div>;
}
function ClientPage({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), c = d.clients.find(x => x.id === id), [edit, setEdit] = useState(false), [ask, setAsk] = useState(false);
  const inv = useMemo(() => liveInvoices(d).filter(i => i.clientId === id).sort((a, b) => b.date.localeCompare(a.date)), [d, id]);
  if (!c) return <Empty title="Client introuvable." />;
  const pending = pendingRequest(d, r => r.kind === "archivage" && r.clientId === c.id);
  return <div className="cx-page">
    <button type="button" className="cx-back" onClick={() => nav({ name: "clients" })}>← Clients</button>
    <header className="cx-page-head"><div><h1>{c.name} {c.archivedAt && <span className="cx-chip">Archivé</span>}</h1><p>{[c.contact, c.phone, c.email].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</p></div>
      <div className="cx-head-actions"><MoreMenu items={!c.archivedAt && !pending ? [{ label: "Demander l’archivage", hint: "Le client n’apparaîtra plus dans les listes", onClick: () => setAsk(true) }] : []} /><Button icon={<Pencil size={18} />} onClick={() => setEdit(true)}>Modifier</Button>{!c.archivedAt && <Button kind="primary" icon={<FilePlus2 size={20} />} onClick={() => nav({ name: "nouvelle", filter: c.id, id: "n" + Date.now() })}>Nouvelle facture</Button>}</div></header>
    {pending && <Notice tone="warn">Archivage demandé le {dateFr(pending.at)}, en attente du responsable.</Notice>}
    <div className="cx-card cx-details">{[["Adresse", c.address], ["NIU", c.niu], ["RCCM", c.rc], ["E-mail", c.email]].map(([k, v]) => <p key={k}><span>{k}</span><strong>{v || "—"}</strong></p>)}</div>
    <h2 className="cx-h2">Factures</h2>
    <div className="cx-list">{inv.length ? inv.map(i => <InvoiceRow key={i.id} i={i} d={d} showClient={false} onClick={() => nav({ name: "facture", id: i.id })} />) : <Empty title="Aucune facture pour ce client." />}</div>
    {edit && <ClientForm client={c} by={ME} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
    {ask && <RequestModal kind="archivage" by={ME} client={c} onClose={() => setAsk(false)} />}
  </div>;
}
function MyRequests() {
  const d = useData(), mine = d.requests.filter(r => r.by === ME);
  return <div className="cx-page"><header className="cx-page-head"><div><h1>Demandes</h1><p>Vos demandes au responsable et ses réponses.</p></div></header>
    <div className="cx-stack">{mine.length ? mine.map(r => <RequestCard key={r.id} r={r} d={d} />) : <Empty title="Aucune demande envoyée.">Pour corriger une facture, ouvrez-la puis « Plus… ».</Empty>}</div></div>;
}
