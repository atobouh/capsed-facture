import { useState } from "react";
import { Check, FileText, Pencil, Plus, Printer, Undo2 } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import { exportInvoice } from "../receipt-export";
import { downloadStatement, exportStatementExcel } from "../account-statement";
import { periodTitle } from "../statement-period";
import type { StatementPeriod } from "../statement-period";
import { Button, Confirm, CreditPaperView, DateInput, Empty, Field, Modal, MoreMenu, Notice, PageHead, Paper, SearchBox, StatementPaper, StatusChip, TextArea, Timeline, matches, toast } from "./ui";
import { ClientAccount, ClientForm, ClientsDirectory } from "./clients";
import type { OfficeRoute } from "./clients";
import Composer from "./composer";
import { CreditModal, CreditPicker, PaymentModal } from "./payments";
import { REQUEST_LABEL, accountName, balance, commit, dateFr, dateValid, delivery, monthLabel, money, nowIso, timeFr, todayIso, useData } from "./store";
import type { Data, Request, Role } from "./store";
import { words } from "./words";

type Nav = (r: OfficeRoute) => void;

export function OfficeScreen({ role, by, route, nav }: { role: Role; by: string; route: OfficeRoute; nav: Nav }) {
  switch (route.name) {
    case "compose": return <Composer key={`${route.id}-${route.extra}`} editId={route.id} clientId={route.extra && !route.extra.startsWith("req:") ? route.extra : undefined} requestId={route.extra?.startsWith("req:") ? route.extra.slice(4) : undefined} by={by}
      onDone={id => nav({ name: "invoice", id })} onCancel={() => nav(route.id ? { name: "invoice", id: route.id } : { name: "register" })} />;
    case "invoice": return <InvoiceView id={route.id!} role={role} by={by} nav={nav} />;
    case "credit": return <CreditView id={route.id!} nav={nav} />;
    case "clients": return <ClientsDirectory role={role} by={by} nav={nav} />;
    case "client": return <ClientAccount id={route.id!} role={role} by={by} nav={nav} />;
    case "situation": return role === "encaissement" && route.id ? <ClientStatement id={route.id} nav={nav} /> : <ClientsDirectory role={role} by={by} nav={nav} />;
    case "inbox": return <Inbox role={role} by={by} nav={nav} />;
    default: return role === "facturation" ? <Register by={by} nav={nav} /> : <ClientsDirectory role={role} by={by} nav={nav} />;
  }
}
function ClientStatement({ id, nav }: { id: string; nav: Nav }) { const d = useData(); return <Situation data={d} clientId={id} fixedClient onBack={() => nav({ name: "client", id })} />; }

function Register({ by, nav }: { by: string; nav: Nav }) {
  const d = useData(), month = d.month, closed = d.closedMonths.includes(month);
  const [tab, setTab] = useState<"factures" | "avoirs">("factures"), [q, setQ] = useState(""), [picker, setPicker] = useState(false), [credit, setCredit] = useState<string | null>(null), [closing, setClosing] = useState(false);
  const bills = d.invoices.filter(i => i.date.startsWith(month)).sort((a, b) => b.number.localeCompare(a.number)), notes = d.credits.filter(c => c.date.startsWith(month)).sort((a, b) => b.number.localeCompare(a.number));
  const shownBills = bills.filter(i => matches(q, i.number, i.client.name)), shownNotes = notes.filter(c => matches(q, c.number, c.client.name, c.invoiceNumber));
  const eligible = d.invoices.some(i => { const b = balance(i, d.payments, d.credits); return b.credited < b.total; });
  const sum = (f: "total" | "received" | "due") => bills.reduce((s, i) => s + balance(i, d.payments, d.credits)[f], 0);
  return <div className="cx-page">
    <PageHead title="Factures" actions={tab === "factures"
      ? <Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} disabled={closed} title={closed ? "Ce mois est clôturé" : undefined} onClick={() => nav({ name: "compose" })}>Nouvelle facture</Button>
      : <Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} disabled={!eligible} onClick={() => setPicker(true)}>Créer un avoir</Button>} />
    <div className="cx-toolbar">
      <label className="cx-month"><span>Mois</span><input type="month" value={month} onChange={e => e.target.value && commit(by, () => ({ month: e.target.value }))} /></label>
      <div className="cx-tabs" role="tablist" aria-label="Type de document"><button role="tab" aria-selected={tab === "factures"} onClick={() => { setTab("factures"); setQ(""); }}>Factures <span>{bills.length}</span></button><button role="tab" aria-selected={tab === "avoirs"} onClick={() => { setTab("avoirs"); setQ(""); }}>Avoirs <span>{notes.length}</span></button></div>
      <SearchBox value={q} onChange={setQ} placeholder={tab === "factures" ? "Chercher un client ou un numéro…" : "Chercher un avoir…"} />
    </div>
    {closed && <Notice>{monthLabel(month)} est clôturé : ses factures restent consultables, mais ne peuvent plus être créées ni modifiées.</Notice>}
    {tab === "factures" && bills.length > 0 && <dl className="cx-facts"><div><dt>Facturé en {monthLabel(month)}</dt><dd>{money(sum("total"))}</dd></div><div><dt>Déjà reçu</dt><dd>{money(sum("received"))}</dd></div><div><dt>Reste à recevoir</dt><dd className="cx-strong">{money(sum("due"))}</dd></div></dl>}
    <section className="cx-panel">
      {tab === "factures" && (shownBills.length ? <table className="cx-table"><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th className="cx-num">Montant</th><th>Paiement</th><th>Remise au client</th></tr></thead><tbody>
        {shownBills.map(i => { const b = balance(i, d.payments, d.credits); return <tr key={i.id} className="cx-clickable" onClick={() => nav({ name: "invoice", id: i.id })}>
          <td><button type="button" className="cx-doc-link" onClick={e => { e.stopPropagation(); nav({ name: "invoice", id: i.id }); }}>{i.number}</button></td><td>{i.client.name}</td><td>{dateFr(i.date)}</td><td className="cx-num">{money(b.total)}</td><td><StatusChip status={b.status} /></td><td>{delivery(d, i.id) ? <span className="cx-good-text"><Check size={15} aria-hidden="true" />Oui</span> : <span className="cx-muted">Pas encore</span>}</td></tr>; })}
      </tbody></table> : <Empty title={q ? "Aucune facture ne correspond." : `Aucune facture en ${monthLabel(month)}.`} action={!q && !closed ? <Button kind="primary" onClick={() => nav({ name: "compose" })}>Créer la première facture</Button> : undefined}>{q ? "Essayez le nom du client ou le numéro." : null}</Empty>)}
      {tab === "avoirs" && (shownNotes.length ? <table className="cx-table"><thead><tr><th>Avoir</th><th>Client</th><th>Facture d’origine</th><th>Date</th><th className="cx-num">Montant</th></tr></thead><tbody>
        {shownNotes.map(c => <tr key={c.id} className="cx-clickable" onClick={() => nav({ name: "credit", id: c.id })}><td><button type="button" className="cx-doc-link" onClick={e => { e.stopPropagation(); nav({ name: "credit", id: c.id }); }}>{c.number}</button></td><td>{c.client.name}</td><td>{c.invoiceNumber}</td><td>{dateFr(c.date)}</td><td className="cx-num">− {money(c.amount)}</td></tr>)}
      </tbody></table> : <Empty title={q ? "Aucun avoir ne correspond." : `Aucun avoir en ${monthLabel(month)}.`}>Un avoir réduit ou annule le montant d’une facture déjà émise.</Empty>)}
    </section>
    {!closed && <div className="cx-page-foot"><Button kind="quiet" onClick={() => setClosing(true)}>Clôturer {monthLabel(month)}</Button></div>}
    {picker && <CreditPicker onClose={() => setPicker(false)} onPick={id => { setPicker(false); setCredit(id); }} />}
    {credit && <CreditModal invoiceId={credit} by={by} onClose={() => setCredit(null)} onIssued={id => { setCredit(null); nav({ name: "credit", id }); }} />}
    {closing && <Confirm title={`Clôturer ${monthLabel(month)} ?`} confirm={`Clôturer ${monthLabel(month)}`} cancel="Ne pas clôturer" onClose={() => setClosing(false)} onConfirm={() => { const [y, m] = month.split("-").map(Number), n = new Date(y, m, 1), nextM = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; commit(by, x => ({ closedMonths: [...x.closedMonths, month], month: nextM }), { text: `${monthLabel(month)} clôturé` }); setClosing(false); toast(`${monthLabel(month)} clôturé. Le mois suivant est ouvert.`); }}>
      <p>Après la clôture, plus aucune facture ni aucun avoir ne pourra être créé ou modifié pour {monthLabel(month)}. Les factures resteront consultables et les paiements pourront toujours être enregistrés.</p></Confirm>}
  </div>;
}

function InvoiceView({ id, role, by, nav }: { id: string; role: Role; by: string; nav: Nav }) {
  const d = useData(), i = d.invoices.find(x => x.id === id), [pay, setPay] = useState(false), [credit, setCredit] = useState(false), [undo, setUndo] = useState(false);
  if (!i) return <Empty title="Facture introuvable." action={<Button onClick={() => nav({ name: role === "facturation" ? "register" : "clients" })}>Retour</Button>} />;
  const b = balance(i, d.payments, d.credits), closed = d.closedMonths.includes(i.date.slice(0, 7)), deliv = delivery(d, i.id), biller = role === "facturation";
  const more = [
    { label: "Exporter en Excel", onClick: () => exportInvoice(i, words) },
    ...(biller && b.credited < b.total ? [{ label: "Créer un avoir", hint: "Réduire ou annuler le montant de cette facture", onClick: () => setCredit(true) }] : []),
    ...(biller && deliv ? [{ label: "Annuler la remise", hint: "Si la facture n’a pas été donnée au client", onClick: () => setUndo(true) }] : []),
    { label: "Voir le compte du client", onClick: () => nav({ name: "client", id: i.client.id }) },
  ];
  return <div className="cx-page">
    <PageHead back={{ label: biller ? "Factures" : i.client.name, onClick: () => nav(biller ? { name: "register" } : { name: "client", id: i.client.id }) }} title={`Facture ${i.number}`} sub={`${i.client.name}, le ${dateFr(i.date)}`}
      actions={<><MoreMenu label="Autres actions" items={more} />
        {biller ? <><Button icon={<Pencil size={17} aria-hidden="true" />} disabled={closed} title={closed ? "Le mois de cette facture est clôturé" : undefined} onClick={() => nav({ name: "compose", id: i.id })}>Modifier</Button><Button kind="primary" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button></>
          : <><Button icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button>{b.due > 0 && <Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => setPay(true)}>Enregistrer un paiement</Button>}</>}</>} />
    <dl className="cx-facts cx-noprint">
      <div><dt>Paiement</dt><dd><StatusChip status={b.status} /></dd></div>
      <div><dt>Montant</dt><dd>{money(b.total)}</dd></div>
      <div><dt>Reçu</dt><dd>{money(b.received)}</dd></div>
      {b.credited > 0 && <div><dt>Avoirs</dt><dd>− {money(b.credited)}</dd></div>}
      <div><dt>{b.refund > 0 ? "À rendre au client" : "Reste à payer"}</dt><dd className="cx-strong">{money(b.refund || b.due)}</dd></div>
    </dl>
    <div className="cx-delivery cx-noprint">{deliv ? <p className="cx-good-text"><Check size={17} aria-hidden="true" />Remise au client le {dateFr(deliv.declaredAt)} par {accountName(deliv.by)}</p>
      : biller ? <><p>Cette facture n’a pas encore été remise au client.</p><Button onClick={() => { commit(by, x => ({ invoiceDeliveries: [...x.invoiceDeliveries, { invoiceId: i.id, declaredAt: nowIso(), by }] }), { text: `Facture ${i.number} remise au client`, clientId: i.client.id, invoiceId: i.id }); toast("Facture marquée comme remise au client."); }}>Marquer comme remise au client</Button></> : <p className="cx-muted">Pas encore remise au client.</p>}</div>
    <Paper invoice={i} title={`Facture ${i.number}`} />
    <details className="cx-disclosure cx-noprint"><summary>Historique de la facture</summary>
      <Timeline events={d.events.filter(e => e.invoiceId === i.id)} />
      {i.history?.length ? <div className="cx-versions">{i.history.map((v, k) => <details key={k}><summary>Version {k + 1} avant modification, {money(invoiceTotals(v).ttc)}</summary><Paper invoice={v} title={`Version ${k + 1}`} /></details>)}</div> : null}
    </details>
    {pay && <PaymentModal invoiceId={i.id} by={by} onClose={() => setPay(false)} />}
    {credit && <CreditModal invoiceId={i.id} by={by} onClose={() => setCredit(false)} onIssued={cid => { setCredit(false); nav({ name: "credit", id: cid }); }} />}
    {undo && <Confirm title="Annuler la remise ?" confirm="Annuler la remise" cancel="Garder la remise" onClose={() => setUndo(false)} onConfirm={() => { commit(by, x => ({ invoiceDeliveries: x.invoiceDeliveries.map(r => r.invoiceId === i.id && !r.cancelledAt ? { ...r, cancelledAt: nowIso(), cancelledBy: by } : r) }), { text: `Remise de la facture ${i.number} annulée`, clientId: i.client.id, invoiceId: i.id }); setUndo(false); toast("Remise annulée. L’historique la garde."); }}>
      <p>La facture sera de nouveau notée comme pas encore remise. La déclaration du {deliv ? dateFr(deliv.declaredAt) : ""} reste dans l’historique.</p></Confirm>}
  </div>;
}

function CreditView({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), c = d.credits.find(x => x.id === id);
  if (!c) return <Empty title="Avoir introuvable." />;
  return <div className="cx-page">
    <PageHead back={{ label: "Factures", onClick: () => nav({ name: "register" }) }} title={`Avoir ${c.number}`} sub={`${c.client.name}, sur la facture ${c.invoiceNumber}`}
      actions={<><Button onClick={() => nav({ name: "invoice", id: c.invoiceId })}>Voir la facture d’origine</Button><Button kind="primary" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button></>} />
    <CreditPaperView credit={c} />
  </div>;
}

/** Statement for a period. Direction: any client or all; Encaissement: one client. Chosen inline, shown whole. */
export function Situation({ data, clientId: initial, fixedClient, onBack }: { data: Pick<Data, "clients" | "invoices" | "payments" | "credits" | "format">; clientId: string; fixedClient?: boolean; onBack?: () => void }) {
  const year = todayIso().slice(0, 4), [clientId, setClientId] = useState(initial), [period, setPeriod] = useState<StatementPeriod>({ from: year + "-01-01", to: todayIso() });
  const valid = dateValid(period.from) && dateValid(period.to) && period.from <= period.to, client = data.clients.find(c => c.id === clientId);
  return <div className="cx-page">
    <PageHead back={onBack ? { label: client?.name ?? "Retour", onClick: onBack } : undefined} title={client ? `Relevé de ${client.name}` : "Situation de tous les clients"} sub={valid ? periodTitle(period) : undefined}
      actions={valid ? <><MoreMenu label="Exporter" items={[{ label: "Excel", onClick: () => exportStatementExcel(data.clients, data.invoices, data.payments, data.credits, clientId, period) }, { label: "CSV", onClick: () => downloadStatement(data.clients, data.invoices, data.payments, data.credits, clientId, period) }]} /><Button kind="primary" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button></> : undefined} />
    <div className="cx-toolbar cx-noprint">
      {!fixedClient && <label className="cx-select"><span>Pour</span><select value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Tous les clients</option>{data.clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label className="cx-month"><span>Du</span><DateInput value={period.from} onChange={v => setPeriod(p => ({ ...p, from: v }))} /></label>
      <label className="cx-month"><span>Au</span><DateInput value={period.to} min={period.from} onChange={v => setPeriod(p => ({ ...p, to: v }))} /></label>
      <div className="cx-quick"><button type="button" className="cx-pill" onClick={() => setPeriod({ from: todayIso().slice(0, 8) + "01", to: todayIso() })}>Ce mois-ci</button><button type="button" className="cx-pill" onClick={() => setPeriod({ from: year + "-01-01", to: todayIso() })}>Cette année</button></div>
    </div>
    {valid ? <StatementPaper d={data} clientId={clientId} period={period} /> : <Notice tone="bad">La date de début doit être avant la date de fin.</Notice>}
  </div>;
}

/** Requests sent by the Direction to this role. They never change a balance by themselves. */
function Inbox({ role, by, nav }: { role: Role; by: string; nav: Nav }) {
  const d = useData(), [filter, setFilter] = useState<"open" | "done">("open"), [active, setActive] = useState<string | null>(null), [response, setResponse] = useState(""), [form, setForm] = useState<Request | null>(null), [pay, setPay] = useState<Request | null>(null);
  const mine = d.requests.filter(r => r.to === role && r.receivedAt), visible = mine.filter(r => filter === "done" ? !!r.resolvedAt : !r.resolvedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const r = mine.find(x => x.id === active);
  function open(x: Request) { setActive(x.id); setResponse(x.response ?? ""); if (!x.readAt) commit(by, dd => ({ requests: dd.requests.map(y => y.id === x.id ? { ...y, readAt: nowIso() } : y) })); }
  function resolve() { if (!r || !response.trim()) return; commit(by, dd => ({ requests: dd.requests.map(y => y.id === r.id ? { ...y, resolvedAt: nowIso(), resolvedBy: by, response: response.trim() } : y) }), { text: `Demande traitée : ${REQUEST_LABEL[r.kind].toLowerCase()}, ${response.trim()}`, clientId: r.clientId, invoiceId: r.invoiceId }); setActive(null); toast("Réponse envoyée à la Direction."); }
  const inv = r?.invoiceId ? d.invoices.find(i => i.id === r.invoiceId) : undefined, invDue = inv ? balance(inv, d.payments, d.credits).due : 0;
  const action = r && !r.resolvedAt ? r.kind === "paiement" ? { label: "Enregistrer ce paiement", run: () => setPay(r), disabled: !invDue } : r.kind === "facture" ? { label: "Créer la facture", run: () => nav({ name: "compose", extra: "req:" + r.id }) } : { label: "Créer le client", run: () => setForm(r) } : null;
  return <div className="cx-page">
    <PageHead title="Demandes" sub={role === "facturation" ? "La Direction vous demande de créer une facture ou un client." : "La Direction signale des paiements à vérifier."} />
    <div className="cx-tabs" role="tablist" aria-label="Demandes"><button role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>À traiter <span>{mine.filter(x => !x.resolvedAt).length}</span></button><button role="tab" aria-selected={filter === "done"} onClick={() => setFilter("done")}>Traitées <span>{mine.filter(x => x.resolvedAt).length}</span></button></div>
    <section className="cx-panel cx-list">{visible.map(x => <button type="button" key={x.id} className="cx-list-row" onClick={() => open(x)}>
      <span className="cx-list-main"><strong>{!x.readAt && <span className="cx-new" aria-label="Nouvelle" />}{REQUEST_LABEL[x.kind]}{x.amount ? `, ${money(x.amount)}` : ""}</strong><small>{x.clientName}{x.invoiceNumber ? `, facture ${x.invoiceNumber}` : ""}. Envoyée le {timeFr(x.createdAt)}</small></span>
      <RequestState r={x} /></button>)}
      {!visible.length && <Empty title={filter === "done" ? "Aucune demande traitée." : "Rien à traiter."}>Les demandes de la Direction arrivent ici.</Empty>}</section>
    {r && <Modal title={REQUEST_LABEL[r.kind]} subtitle={`${r.clientName}${r.invoiceNumber ? `, facture ${r.invoiceNumber}` : ""}`} onClose={() => setActive(null)}
      actions={action ? <><Button kind="quiet" onClick={() => setActive(null)}>Plus tard</Button><Button kind="primary" disabled={action.disabled} title={action.disabled ? "Cette facture est déjà réglée" : undefined} onClick={() => { setActive(null); action.run(); }}>{action.label}</Button></> : undefined}>
      {r.kind === "paiement" && <dl className="cx-facts cx-facts-tight"><div><dt>Montant signalé</dt><dd>{money(r.amount ?? 0)}</dd></div><div><dt>Mode</dt><dd>{r.method}</dd></div><div><dt>Payé le</dt><dd>{r.paymentDate ? dateFr(r.paymentDate) : "—"}</dd></div>{r.reference && <div><dt>Référence</dt><dd>{r.reference}</dd></div>}</dl>}
      {r.kind === "client" && r.newClient && <dl className="cx-facts cx-facts-tight">{Object.entries({ Nom: r.newClient.name, Contact: r.newClient.contact, Téléphone: r.newClient.phone, Adresse: r.newClient.address }).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {r.message && <p className="cx-quote">« {r.message} »</p>}
      {r.kind === "paiement" && d.payments.some(p => p.invoiceId === r.invoiceId && !p.cancelledAt && p.amount === r.amount) && <Notice tone="warn">Un paiement du même montant existe déjà sur cette facture. Vérifiez sa date et sa référence avant d’en saisir un autre.</Notice>}
      {r.invoiceId && <p><button type="button" className="cx-text-btn" onClick={() => { setActive(null); nav({ name: "invoice", id: r.invoiceId }); }}><FileText size={16} aria-hidden="true" />Ouvrir la facture {r.invoiceNumber}</button></p>}
      {r.resolvedAt ? <p className="cx-answer">Réponse : {r.response}</p> : <details className="cx-disclosure"><summary>Rien à {r.kind === "paiement" ? "enregistrer" : "créer"} ? Répondre à la Direction</summary>
        <Field label="Votre réponse" hint={r.kind === "paiement" ? "Répondre ne change pas le solde du client." : undefined}><TextArea rows={2} value={response} onChange={setResponse} placeholder={r.kind === "paiement" ? "Ex. Déjà enregistré le 02/10, référence OM123…" : "Ex. Ce client existe déjà sous le nom…"} /></Field>
        <Button disabled={!response.trim()} icon={<Undo2 size={15} aria-hidden="true" />} onClick={resolve}>Envoyer la réponse</Button></details>}
    </Modal>}
    {form && <ClientForm client={{ id: "", name: form.newClient?.name ?? "", contact: form.newClient?.contact ?? "", address: form.newClient?.address ?? "", phone: form.newClient?.phone ?? "", email: form.newClient?.email ?? "", niu: "", rc: "" }} requestId={form.id} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); nav({ name: "client", id: c.id }); }} />}
    {pay && pay.invoiceId && <PaymentModal invoiceId={pay.invoiceId} requestId={pay.id} by={by} onClose={() => setPay(null)} />}
  </div>;
}
export function RequestState({ r }: { r: Request }) {
  const [tone, label] = r.resolvedAt ? ["good", "Traitée"] : r.readAt ? ["info", "Lue"] : r.receivedAt ? ["warn", "Nouvelle"] : ["neutral", "En attente du bureau"];
  return <span className={`cx-chip cx-tone-${tone}`}>{label}</span>;
}
