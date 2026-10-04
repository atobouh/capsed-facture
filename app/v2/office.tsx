import { useState } from "react";
import { Check, FileText, Pencil, Plus, Printer, Undo2 } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import { exportInvoice } from "../receipt-export";
import { downloadStatement, exportStatementExcel } from "../account-statement";
import { periodTitle } from "../statement-period";
import type { StatementPeriod } from "../statement-period";
import { Button, Confirm, CreditPaperView, DateInput, Empty, Field, Modal, MonthStepper, MoreMenu, Notice, PageHead, Paper, Row, SearchBox, Stamp, StatementPaper, StatusChip, TextArea, Timeline, matches, toast, useWide } from "./ui";
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
  const d = useData(), month = d.month, closed = d.closedMonths.includes(month), wide = useWide();
  const [q, setQ] = useState(""), [picker, setPicker] = useState(false), [credit, setCredit] = useState<string | null>(null), [closing, setClosing] = useState(false), [sel, setSel] = useState<{ kind: "invoice" | "credit"; id: string } | null>(null);
  const bills = d.invoices.filter(i => i.date.startsWith(month)).sort((a, b) => b.number.localeCompare(a.number)), notes = d.credits.filter(c => c.date.startsWith(month)).sort((a, b) => b.number.localeCompare(a.number));
  const shownBills = bills.filter(i => matches(q, i.number, i.client.name)), shownNotes = notes.filter(c => matches(q, c.number, c.client.name, c.invoiceNumber));
  const eligible = d.invoices.some(i => { const b = balance(i, d.payments, d.credits); return b.credited < b.total; });
  const sum = (f: "total" | "received" | "due") => bills.reduce((s, i) => s + balance(i, d.payments, d.credits)[f], 0);
  const valid = sel && (sel.kind === "invoice" ? shownBills.some(i => i.id === sel.id) : shownNotes.some(c => c.id === sel.id));
  const current = valid ? sel : shownBills[0] ? { kind: "invoice" as const, id: shownBills[0].id } : shownNotes[0] ? { kind: "credit" as const, id: shownNotes[0].id } : null;
  const open = (kind: "invoice" | "credit", id: string) => wide ? setSel({ kind, id }) : nav({ name: kind, id });
  const list = <>
    {shownBills.length ? <div className="cx-rows" role="list" aria-label={`Factures de ${monthLabel(month)}`}>{shownBills.map(i => { const b = balance(i, d.payments, d.credits), dv = delivery(d, i.id);
      return <Row key={i.id} current={wide && current?.kind === "invoice" && current.id === i.id} onClick={() => open("invoice", i.id)} title={i.client.name} todo={!dv ? "Pas encore remise au client" : undefined}
        sub={<><span className="cx-num-id">{i.number}</span><span>{dateFr(i.date)}</span></>} amount={money(b.total)} state={<StatusChip status={b.status} />} />; })}</div>
      : <Empty title={q ? "Aucune facture ne correspond." : `Aucune facture en ${monthLabel(month)}.`} action={!q && !closed ? <Button kind="primary" onClick={() => nav({ name: "compose" })}>Créer la première facture</Button> : undefined}>{q ? "Essayez le nom du client ou le numéro." : null}</Empty>}
    <div className="cx-list-section">
      <div className="cx-list-section-head"><h2>Avoirs du mois</h2><Button size="sm" icon={<Plus size={16} aria-hidden="true" />} disabled={!eligible || closed} onClick={() => setPicker(true)}>Créer un avoir</Button></div>
      {shownNotes.length ? <div className="cx-rows" role="list">{shownNotes.map(c => <Row key={c.id} current={wide && current?.kind === "credit" && current.id === c.id} onClick={() => open("credit", c.id)} title={c.client.name} sub={<><span className="cx-num-id">{c.number}</span><span>sur {c.invoiceNumber}</span></>} amount={`− ${money(c.amount)}`} />)}</div>
        : <p className="cx-list-note">Aucun avoir ce mois-ci. Un avoir réduit ou annule une facture déjà émise.</p>}
    </div>
    {!closed && <div className="cx-list-foot"><Button kind="quiet" onClick={() => setClosing(true)}>Clôturer {monthLabel(month)}…</Button></div>}
  </>;
  return <div className={`cx-page${wide ? " cx-page-split" : ""}`}>
    <PageHead title="Factures" sub={closed ? `${monthLabel(month)}, clôturé` : undefined} actions={<Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} disabled={closed} title={closed ? "Ce mois est clôturé" : "Ctrl+N"} onClick={() => nav({ name: "compose" })}>Nouvelle facture</Button>} />
    <div className="cx-toolbar">
      <MonthStepper value={month} onChange={v => { commit(by, () => ({ month: v })); setSel(null); }} />
      <SearchBox value={q} onChange={setQ} placeholder="Client ou numéro…" />
      {bills.length > 0 && <dl className="cx-mini-facts"><div><dt>Facturé</dt><dd>{money(sum("total"))}</dd></div><div><dt>Reçu</dt><dd>{money(sum("received"))}</dd></div><div className="cx-mini-strong"><dt>Reste à recevoir</dt><dd>{money(sum("due"))}</dd></div></dl>}
    </div>
    {closed && <Notice>{monthLabel(month)} est clôturé : ses factures restent consultables, mais ne peuvent plus être créées ni modifiées.</Notice>}
    {wide ? <div className="cx-split">
      <section className="cx-pane-list" aria-label="Liste">{list}</section>
      <section className="cx-pane-detail" aria-label="Document choisi">{current ? current.kind === "invoice" ? <InvoiceView key={current.id} id={current.id} role="facturation" by={by} nav={nav} pane /> : <CreditView key={current.id} id={current.id} nav={nav} pane /> : <Empty title="Choisissez une facture dans la liste." />}</section>
    </div> : <section className="cx-panel">{list}</section>}
    {picker && <CreditPicker onClose={() => setPicker(false)} onPick={id => { setPicker(false); setCredit(id); }} />}
    {credit && <CreditModal invoiceId={credit} by={by} onClose={() => setCredit(null)} onIssued={id => { setCredit(null); open("credit", id); }} />}
    {closing && <Confirm title={`Clôturer ${monthLabel(month)} ?`} confirm={`Clôturer ${monthLabel(month)}`} cancel="Ne pas clôturer" onClose={() => setClosing(false)} onConfirm={() => { const [y, m] = month.split("-").map(Number), n = new Date(y, m, 1), nextM = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; commit(by, x => ({ closedMonths: [...x.closedMonths, month], month: nextM }), { text: `${monthLabel(month)} clôturé` }); setClosing(false); toast(`${monthLabel(month)} clôturé. Le mois suivant est ouvert.`); }}>
      <p>Après la clôture, plus aucune facture ni aucun avoir ne pourra être créé ou modifié pour {monthLabel(month)}. Les factures resteront consultables et les paiements pourront toujours être enregistrés.</p></Confirm>}
  </div>;
}

export function InvoiceView({ id, role, by, nav, pane }: { id: string; role: Role; by: string; nav: Nav; pane?: boolean }) {
  const d = useData(), i = d.invoices.find(x => x.id === id), [pay, setPay] = useState(false), [credit, setCredit] = useState(false), [undo, setUndo] = useState(false);
  if (!i) return <Empty title="Facture introuvable." action={<Button onClick={() => nav({ name: role === "facturation" ? "register" : "clients" })}>Retour</Button>} />;
  const b = balance(i, d.payments, d.credits), closed = d.closedMonths.includes(i.date.slice(0, 7)), deliv = delivery(d, i.id), biller = role === "facturation";
  const more = [
    { label: "Exporter en Excel", onClick: () => exportInvoice(i, words) },
    ...(biller && b.credited < b.total ? [{ label: "Créer un avoir", hint: "Réduire ou annuler le montant de cette facture", onClick: () => setCredit(true) }] : []),
    ...(biller && deliv ? [{ label: "Annuler la remise", hint: "Si la facture n’a pas été donnée au client", onClick: () => setUndo(true) }] : []),
    { label: "Voir le compte du client", onClick: () => nav({ name: "client", id: i.client.id }) },
  ];
  return <div className={pane ? "cx-detail" : "cx-page"}>
    <PageHead pane={pane} back={pane ? undefined : { label: biller ? "Factures" : i.client.name, onClick: () => nav(biller ? { name: "register" } : { name: "client", id: i.client.id }) }} title={<>Facture {i.number}{b.status === "Payée" && <Stamp tone="good">Payée</Stamp>}</>} sub={`${i.client.name}, le ${dateFr(i.date)}`}
      actions={<><MoreMenu label="Autres actions" items={more} />
        {biller ? <><Button icon={<Pencil size={17} aria-hidden="true" />} disabled={closed} title={closed ? "Le mois de cette facture est clôturé" : undefined} onClick={() => nav({ name: "compose", id: i.id })}>Modifier</Button><Button kind="primary" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button></>
          : <><Button icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button>{b.due > 0 && <Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => setPay(true)}>Enregistrer un paiement</Button>}</>}</>} />
    <dl className="cx-facts cx-noprint">
      <div><dt>Montant</dt><dd>{money(b.total)}</dd></div>
      <div><dt>Reçu</dt><dd>{money(b.received)}</dd></div>
      {b.credited > 0 && <div><dt>Avoirs</dt><dd>− {money(b.credited)}</dd></div>}
      <div><dt>{b.refund > 0 ? "À rendre au client" : "Reste à payer"}</dt><dd className="cx-strong">{money(b.refund || b.due)}</dd></div>
    </dl>
    <div className={`cx-delivery cx-noprint${deliv ? " cx-delivery-done" : ""}`}>{deliv ? <p><Stamp tone="plum">Remise</Stamp>au client le {dateFr(deliv.declaredAt)} par {accountName(deliv.by)}</p>
      : biller ? <><p><strong>Pas encore remise au client.</strong> Une fois donnée, notez-le ici.</p><Button kind="secondary" icon={<Check size={18} aria-hidden="true" />} onClick={() => { commit(by, x => ({ invoiceDeliveries: [...x.invoiceDeliveries, { invoiceId: i.id, declaredAt: nowIso(), by }] }), { text: `Facture ${i.number} remise au client`, clientId: i.client.id, invoiceId: i.id }); toast("Facture marquée comme remise au client."); }}>Marquer comme remise</Button></> : <p className="cx-muted">Pas encore remise au client.</p>}</div>
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

function CreditView({ id, nav, pane }: { id: string; nav: Nav; pane?: boolean }) {
  const d = useData(), c = d.credits.find(x => x.id === id);
  if (!c) return <Empty title="Avoir introuvable." />;
  return <div className={pane ? "cx-detail" : "cx-page"}>
    <PageHead pane={pane} back={pane ? undefined : { label: "Factures", onClick: () => nav({ name: "register" }) }} title={`Avoir ${c.number}`} sub={`${c.client.name}, sur la facture ${c.invoiceNumber}`}
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
  const d = useData(), wide = useWide(), [active, setActive] = useState<string | null>(null), [form, setForm] = useState<Request | null>(null), [pay, setPay] = useState<Request | null>(null);
  const mine = d.requests.filter(r => r.to === role && r.receivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), todo = mine.filter(r => !r.resolvedAt), done = mine.filter(r => r.resolvedAt);
  const current = mine.find(x => x.id === active) ?? (wide ? todo[0] ?? done[0] : undefined);
  function open(x: Request) { setActive(x.id); if (!x.readAt) commit(by, dd => ({ requests: dd.requests.map(y => y.id === x.id ? { ...y, readAt: nowIso() } : y) })); }
  const row = (x: Request) => <Row key={x.id} current={wide && current?.id === x.id} onClick={() => open(x)} lead={!x.readAt ? <span className="cx-new" aria-label="Nouvelle" /> : undefined}
    title={`${REQUEST_LABEL[x.kind]}${x.amount ? `, ${money(x.amount)}` : ""}`} sub={<><span>{x.clientName}</span>{x.invoiceNumber && <span className="cx-num-id">{x.invoiceNumber}</span>}<span>{timeFr(x.createdAt)}</span></>} state={<RequestState r={x} />} />;
  const list = <>
    {todo.length ? <div className="cx-rows" role="list">{todo.map(row)}</div> : <Empty title="Rien à faire pour l’instant.">Les demandes de la Direction arrivent ici.</Empty>}
    {done.length > 0 && <details className="cx-list-more"><summary>Déjà traitées ({done.length})</summary><div className="cx-rows" role="list">{done.map(row)}</div></details>}
  </>;
  const detail = current && <RequestDetail key={current.id} r={current} by={by} nav={nav} onAct={kind => { setActive(null); if (kind === "pay") setPay(current); else if (kind === "client") setForm(current); else nav({ name: "compose", extra: "req:" + current.id }); }} />;
  return <div className={`cx-page${wide ? " cx-page-split" : ""}`}>
    <PageHead title="Demandes" sub={role === "facturation" ? "La Direction vous demande de créer une facture ou un client." : "La Direction signale des paiements à vérifier."} />
    {!mine.length ? <section className="cx-panel cx-empty-big"><Empty icon={<FileText size={40} aria-hidden="true" />} title="Rien à faire pour l’instant.">Quand la Direction vous demande quelque chose, la demande arrive ici, avec un bouton pour la traiter.</Empty></section>
      : wide ? <div className="cx-split"><section className="cx-pane-list">{list}</section><section className="cx-pane-detail">{detail}</section></div>
      : <section className="cx-panel">{list}</section>}
    {!wide && current && <Modal title={REQUEST_LABEL[current.kind]} subtitle={current.clientName} onClose={() => setActive(null)}>{detail}</Modal>}
    {form && <ClientForm client={{ id: "", name: form.newClient?.name ?? "", contact: form.newClient?.contact ?? "", address: form.newClient?.address ?? "", phone: form.newClient?.phone ?? "", email: form.newClient?.email ?? "", niu: "", rc: "" }} requestId={form.id} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); nav({ name: "client", id: c.id }); }} />}
    {pay && pay.invoiceId && <PaymentModal invoiceId={pay.invoiceId} requestId={pay.id} by={by} onClose={() => setPay(null)} />}
  </div>;
}

function RequestDetail({ r, by, nav, onAct }: { r: Request; by: string; nav: Nav; onAct: (kind: "pay" | "client" | "invoice") => void }) {
  const d = useData(), [response, setResponse] = useState(r.response ?? "");
  const inv = r.invoiceId ? d.invoices.find(i => i.id === r.invoiceId) : undefined, invDue = inv ? balance(inv, d.payments, d.credits).due : 0;
  const action = !r.resolvedAt ? r.kind === "paiement" ? { label: "Enregistrer ce paiement", kind: "pay" as const, disabled: !invDue } : r.kind === "facture" ? { label: "Créer la facture", kind: "invoice" as const } : { label: "Créer le client", kind: "client" as const } : null;
  function resolve() { if (!response.trim()) return; commit(by, dd => ({ requests: dd.requests.map(y => y.id === r.id ? { ...y, resolvedAt: nowIso(), resolvedBy: by, response: response.trim() } : y) }), { text: `Demande traitée : ${REQUEST_LABEL[r.kind].toLowerCase()}, ${response.trim()}`, clientId: r.clientId, invoiceId: r.invoiceId }); toast("Réponse envoyée à la Direction."); }
  return <div className="cx-detail">
    <PageHead pane title={<>{REQUEST_LABEL[r.kind]}{r.resolvedAt && <Stamp tone="good">Traitée</Stamp>}</>} sub={`${r.clientName}${r.invoiceNumber ? `, facture ${r.invoiceNumber}` : ""}. Envoyée le ${timeFr(r.createdAt)}`}
      actions={action ? <Button kind="primary" disabled={action.disabled} title={action.disabled ? "Cette facture est déjà réglée" : undefined} onClick={() => onAct(action.kind)}>{action.label}</Button> : undefined} />
    {r.kind === "paiement" && <dl className="cx-facts"><div><dt>Montant signalé</dt><dd className="cx-strong">{money(r.amount ?? 0)}</dd></div><div><dt>Mode</dt><dd>{r.method}</dd></div><div><dt>Payé le</dt><dd>{r.paymentDate ? dateFr(r.paymentDate) : "—"}</dd></div>{r.reference && <div><dt>Référence</dt><dd>{r.reference}</dd></div>}</dl>}
    {r.kind === "client" && r.newClient && <dl className="cx-facts">{Object.entries({ Nom: r.newClient.name, Contact: r.newClient.contact, Téléphone: r.newClient.phone, Adresse: r.newClient.address }).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    {r.message && <blockquote className="cx-quote">{r.message}<cite>La Direction</cite></blockquote>}
    {r.kind === "paiement" && d.payments.some(p => p.invoiceId === r.invoiceId && !p.cancelledAt && p.amount === r.amount) && <Notice tone="warn">Un paiement du même montant existe déjà sur cette facture. Vérifiez sa date et sa référence avant d’en saisir un autre.</Notice>}
    {r.invoiceId && <p><button type="button" className="cx-text-btn" onClick={() => nav({ name: "invoice", id: r.invoiceId })}><FileText size={17} aria-hidden="true" />Ouvrir la facture {r.invoiceNumber}</button></p>}
    {r.resolvedAt ? <p className="cx-answer"><strong>Votre réponse :</strong> {r.response}</p> : <details className="cx-disclosure"><summary>Rien à {r.kind === "paiement" ? "enregistrer" : "créer"} ? Répondre à la Direction</summary>
      <Field label="Votre réponse" hint={r.kind === "paiement" ? "Répondre ne change pas le solde du client." : undefined}><TextArea rows={2} value={response} onChange={setResponse} placeholder={r.kind === "paiement" ? "Ex. Déjà enregistré le 02/10, référence OM123…" : "Ex. Ce client existe déjà sous le nom…"} /></Field>
      <Button disabled={!response.trim()} icon={<Undo2 size={16} aria-hidden="true" />} onClick={resolve}>Envoyer la réponse</Button></details>}
  </div>;
}
export function RequestState({ r }: { r: Request }) {
  if (r.resolvedAt) return <Stamp tone="good">Traitée</Stamp>;
  const [tone, label] = r.readAt ? ["info", "Lue"] : r.receivedAt ? ["warn", "Nouvelle"] : ["neutral", "En attente du bureau"];
  return <span className={`cx-chip cx-tone-${tone}`}>{label}</span>;
}
