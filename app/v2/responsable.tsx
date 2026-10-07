import { useState } from "react";
import { ChevronRight, FilePlus2, Plus, ClipboardCheck, Clock, Lock, Phone, Printer, Send, UserPlus, WifiOff } from "lucide-react";
import { Button, Choice, Confirm, DateInput, Empty, Field, Modal, Monogram, MoneyInput, MonthStepper, MoreMenu, Notice, PageHead, Paper, Row, SearchBox, Stamp, StatusChip, TextArea, TextInput, Timeline, matches, toast } from "./ui";
import { RequestState, Situation } from "./office";
import { TeamReport } from "./team";
import { LiftDialog, Reglages } from "./reglages";
import { liftRule } from "./overrides";
import Composer from "./composer";
import { exportInvoice } from "../receipt-export";
import { words } from "./words";
import { CancelPayment } from "./payments";
import { DeleteDialog } from "./corbeille";
import type { BinTarget } from "./corbeille";
import { findIssues, numberKey } from "./checks";
import type { Invoice, Payment } from "./store";
import { METHODS, REQUEST_LABEL, ROLE_LABEL, accountName, accountTotals, ago, balance, commit, dateFr, delivery, getData, methodName, money, monthLabel, overdueDays, dueDateOf, nowIso, timeFr, todayIso, uid, useData } from "./store";
import type { Client, Request, RequestKind, Snapshot } from "./store";

/** `extra: "factures"` marks an invoice opened from the Factures page, so « retour » goes back there. */
export type RRoute = { name: "clients" | "client" | "factures" | "facture" | "nouvelle" | "valider" | "situation" | "reglages"; id?: string; extra?: string };
type Nav = (r: RRoute) => void;

export function ResponsableScreen({ route, nav, by }: { route: RRoute; nav: Nav; by: string }) {
  switch (route.name) {
    case "client": return <ClientStory id={route.id!} nav={nav} by={by} />;
    case "valider": case "factures": return <Invoices nav={nav} by={by} />;
    case "nouvelle": return <Composer key={`${route.id ?? "new"}-${route.extra ?? ""}`} clientId={route.id} legacy={route.extra === "ancienne"} by={by} validated onDone={id => nav({ name: "facture", id, extra: "factures" })} onCancel={() => nav(route.id ? { name: "client", id: route.id } : { name: "factures" })} />;
    case "facture": return <InvoiceSheet id={route.id!} fromList={route.extra === "factures"} nav={nav} by={by} />;
    case "situation": return <GlobalSituation key={route.id ?? "all"} clientId={route.id ?? ""} />;
    case "reglages": return <Reglages page={route.id} nav={nav} by={by} />;
    default: return <Overview nav={nav} by={by} />;
  }
}
/** New invoices and payments the Direction has not validated yet. Validation is never required: nothing waits on it.
 *  Old invoices (made before the app, typed in or read from their PDF) are checked by whoever adds them: nothing to validate,
 *  unless something needs a look (a number used twice, a month already closed). */
const newInvoices = (s: Snapshot) => { const issues = findIssues(s); return s.invoices.filter(i => !i.validatedAt && (!i.legacy || issues.sameNumber.has(i.id) || issues.afterClose.has(i.id))).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number)); };
const newPayments = (s: Snapshot) => s.payments.filter(p => !p.lockedAt && !p.cancelledAt).sort((a, b) => a.date.localeCompare(b.date));
export function pendingCount(d: { snapshot: Snapshot }) { return newInvoices(d.snapshot).length + newPayments(d.snapshot).length; }
/** Situation: the clients' statement (HT and TTC) or what the team did, one switch, nothing else. */
function GlobalSituation({ clientId }: { clientId: string }) {
  const d = useData(), [view, setView] = useState<"clients" | "equipe">("clients");
  return <>
    {!clientId && <div className="cx-seg cx-noprint" role="group" aria-label="Situation à afficher">{([["clients", "Les clients"], ["equipe", "L’équipe"]] as const).map(([k, label]) => <button type="button" key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>)}</div>}
    {view === "equipe" && !clientId ? <TeamReport /> : <Situation data={{ ...d.snapshot, format: d.format }} clientId={clientId} />}
  </>;
}

/** Validate invoices and lock payments, only while the office is connected and each item still matches what the office holds. */
function validate(invoiceIds: string[], paymentIds: string[], by: string) {
  const d = getData(); if (!d.officeOnline) { toast("Le bureau est hors ligne : la validation attendra sa reconnexion.", "warn"); return 0; }
  const bills = invoiceIds.filter(id => { const k = d.snapshot.invoices.find(i => i.id === id), l = d.invoices.find(i => i.id === id); return k && l && !l.validatedAt && k.revisedAt === l.revisedAt; });
  const pays = paymentIds.filter(id => { const k = d.snapshot.payments.find(p => p.id === id), l = d.payments.find(p => p.id === id); return k && l && !k.cancelledAt && !l.cancelledAt && !l.lockedAt && k.amount === l.amount && k.date === l.date && k.method === l.method && k.reference === l.reference; });
  if (!bills.length && !pays.length) { toast("Ces éléments ont changé au bureau. Rechargez la page, puis validez.", "warn"); return 0; }
  const at = nowIso();
  commit(by, x => ({
    invoices: x.invoices.map(i => bills.includes(i.id) ? { ...i, validatedAt: at, validatedBy: by } : i),
    payments: x.payments.map(p => pays.includes(p.id) ? { ...p, lockedAt: at } : p),
    events: [
      ...bills.map(id => { const i = d.invoices.find(y => y.id === id)!; return { id: uid(), at, by, text: `Facture ${i.number} validée`, clientId: i.client.id, invoiceId: i.id }; }),
      ...pays.map(id => { const p = d.payments.find(y => y.id === id)!, i = d.invoices.find(y => y.id === p.invoiceId); return { id: uid(), at, by, text: `Paiement de ${money(p.amount)} validé`, clientId: i?.client.id, invoiceId: p.invoiceId }; }),
      ...x.events] }));
  return bills.length + pays.length;
}
function send(r: Omit<Request, "id" | "createdAt" | "by">, by: string) {
  const req: Request = { ...r, id: uid(), createdAt: nowIso(), by };
  commit(by, x => ({ requests: [req, ...x.requests] }), { text: `Demande à ${ROLE_LABEL[req.to].toLowerCase()} : ${REQUEST_LABEL[req.kind].toLowerCase()}${req.amount ? `, ${money(req.amount)}` : ""}`, clientId: req.clientId, invoiceId: req.invoiceId });
  toast(getData().officeOnline ? "Demande envoyée au bureau." : "Demande prête. Elle partira quand le bureau sera reconnecté.");
}

function Overview({ nav, by }: { nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, [q, setQ] = useState(""), [ask, setAsk] = useState(false);
  const rows = s.clients.filter(c => !c.archived).map(c => {
    const items = s.invoices.filter(i => i.client.id === c.id), open = items.filter(i => balance(i, s.payments, s.credits).due > 0);
    const lateDue = open.filter(i => overdueDays(i) > 0).reduce((n, i) => n + balance(i, s.payments, s.credits).due, 0);
    const mine = s.payments.filter(p => !p.cancelledAt && items.some(i => i.id === p.invoiceId)), last = [...mine].sort((x, y) => y.date.localeCompare(x.date))[0];
    return { c, a: accountTotals(items, s.payments, s.credits), count: items.length, late: open.length ? Math.max(...open.map(overdueDays)) : 0, lateDue, last, pending: mine.some(p => !p.lockedAt) };
  });
  const total = rows.reduce((n, r) => n + r.a.due, 0), late = rows.reduce((n, r) => n + r.lateDue, 0), toCheck = pendingCount(d), reqs = [...d.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lateClients = rows.filter(r => r.late > 0).sort((a, b) => b.lateDue - a.lateDue);
  const hits = q.trim().length >= 3 ? s.invoices.filter(i => matches(q, i.number)) : [];
  const list = rows.filter(r => matches(q, r.c.name, r.c.phone, r.c.contact)).sort((a, b) => b.a.due - a.a.due || a.c.name.localeCompare(b.c.name));
  const owing = list.filter(r => r.a.due > 0 || r.a.refund > 0), settled = list.filter(r => !r.a.due && !r.a.refund);
  const sub = (r: typeof rows[number]) => r.late > 0 ? <span className="cx-bad-text">En retard de {r.late} jour{r.late > 1 ? "s" : ""}</span> : r.pending ? <span className="cx-warn-text">Paiement à valider</span> : r.last ? `Dernier paiement le ${dateFr(r.last.date)}` : r.count ? `${r.count} facture${r.count > 1 ? "s" : ""}` : "Aucune facture";
  const row = (r: typeof rows[number]) => <Row key={r.c.id} lead={<Monogram name={r.c.name} />} title={r.c.name} sub={<span>{sub(r)}</span>} amount={r.a.due ? money(r.a.due) : r.a.refund ? `${money(r.a.refund)} à rendre` : undefined} onClick={() => nav({ name: "client", id: r.c.id })} />;
  return <div className="cx-page cx-home">
    <div className="cx-home-side">
      <section className="cx-hero" aria-label="Total à recevoir">
        <p className="cx-hero-top"><span>Il reste à recevoir</span><span className="cx-hero-fresh">{d.officeOnline ? <><i aria-hidden="true" />{s.receivedAt ? `Bureau ${ago(s.receivedAt)}` : "Rien reçu du bureau pour l’instant"}</> : <><WifiOff size={13} aria-hidden="true" />Bureau hors ligne</>}</span></p>
        <p className="cx-hero-amount">{money(total).replace(/\s*FCFA$/, "")} <small>FCFA</small></p>
        {total > 0 && <><div className="cx-aging" aria-hidden="true"><span style={{ flexGrow: total - late }} />{late > 0 && <span className="cx-aging-late" style={{ flexGrow: late }} />}</div>
        <p className="cx-aging-legend"><span><i />À jour {money(total - late)}</span><span><i className="cx-aging-late" />En retard {money(late)}</span></p></>}
      </section>
      {(toCheck > 0 || lateClients.length > 0) && <section aria-labelledby="todo"><h2 id="todo" className="cx-sec-title">À faire</h2>
        <div className="cx-card cx-card-flush cx-rows">
          {toCheck > 0 && <Row lead={<span className="cx-task-icon"><ClipboardCheck size={18} aria-hidden="true" /></span>} title={`${toCheck} nouveauté${toCheck > 1 ? "s" : ""} à valider`} sub={<span>Factures et paiements reçus du bureau</span>} state={<ChevronRight size={18} className="cx-go" aria-hidden="true" />} onClick={() => nav({ name: "factures" })} />}
          {lateClients.slice(0, 2).map(r => <Row key={r.c.id} lead={<span className="cx-task-icon cx-task-bad"><Clock size={18} aria-hidden="true" /></span>} title={`Relancer ${r.c.name}`} sub={<span>{money(r.lateDue)} en retard de {r.late} jour{r.late > 1 ? "s" : ""}</span>} state={<ChevronRight size={18} className="cx-go" aria-hidden="true" />} onClick={() => nav({ name: "client", id: r.c.id })} />)}
        </div></section>}
      {reqs.length > 0 && <details className="cx-fold cx-card"><summary><span>Vos demandes au bureau <em>({reqs.length})</em></span></summary>
        <div className="cx-rows">{reqs.map(r => <Row key={r.id} title={REQUEST_LABEL[r.kind]} sub={<span>{r.clientName}{r.amount ? ` · ${money(r.amount)}` : ""}{r.response ? ` · ${r.response}` : ""}</span>} state={<RequestState r={r} />} onClick={() => r.clientId ? nav({ name: "client", id: r.clientId }) : undefined} />)}</div></details>}
    </div>
    <div className="cx-home-main">
      <section aria-labelledby="clients-title">
        <div className="cx-sec-head"><h2 id="clients-title" className="cx-sec-title">Clients</h2><Button size="sm" icon={<UserPlus size={15} aria-hidden="true" />} onClick={() => setAsk(true)}>Demander un client</Button></div>
        <SearchBox value={q} onChange={setQ} placeholder="Chercher un client ou une facture" />
        {hits.length > 0 && <div className="cx-card cx-card-flush cx-rows cx-gap">{hits.map(i => { const b = balance(i, s.payments, s.credits); return <Row key={i.id} title={`Facture ${i.number}`} sub={<span>{i.client.name}, {dateFr(i.date)}</span>} amount={money(b.due)} state={<StatusChip status={b.status} />} onClick={() => nav({ name: "facture", id: i.id })} />; })}</div>}
        <div className="cx-card cx-card-flush cx-gap">
          {owing.length ? <div className="cx-rows">{owing.map(row)}</div> : <p className="cx-fold-note">{q ? "Aucun client ne correspond." : "Aucun client n’a de reste à payer."}</p>}
          {settled.length > 0 && <details className="cx-fold"><summary><span>Tout payé <em>({settled.length})</em></span></summary><div className="cx-rows">{settled.map(row)}</div></details>}
        </div>
      </section>
    </div>
    {ask && <RequestForm kind="client" by={by} onClose={() => setAsk(false)} />}
  </div>;
}

function ClientStory({ id, nav, by }: { id: string; nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, c = s.clients.find(x => x.id === id), [ask, setAsk] = useState(false), [del, setDel] = useState(false);
  if (!c) return <Empty title="Client introuvable." action={<Button onClick={() => nav({ name: "clients" })}>Accueil</Button>} />;
  const items = s.invoices.filter(i => i.client.id === c.id).sort((a, b) => b.date.localeCompare(a.date)), a = accountTotals(items, s.payments, s.credits);
  const open = items.filter(i => balance(i, s.payments, s.credits).due > 0), done = items.filter(i => !balance(i, s.payments, s.credits).due);
  const pays = s.payments.filter(p => items.some(i => i.id === p.invoiceId)).sort((x, y) => y.date.localeCompare(x.date)), reqs = d.requests.filter(r => r.clientId === c.id);
  const inv = (i: typeof items[number]) => { const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id), late = overdueDays(i);
    return <Row key={i.id} title={<span className="cx-nowrap">{i.number}{i.legacy && <span className="cx-legacy-tag">Ancienne</span>}</span>} sub={<><span>{dateFr(i.date)}</span>{!dv && <span className="cx-warn-text">pas encore remise au client</span>}</>}
      amount={b.due ? money(b.due) : money(b.total)} state={b.due > 0 && late > 0 ? <span className="cx-chip cx-tone-bad">{late} j de retard</span> : <StatusChip status={b.status} />} onClick={() => nav({ name: "facture", id: i.id })} />; };
  const paid = Math.max(0, a.total - a.credited - a.due);
  return <div className="cx-page cx-story">
    <PageHead back={{ label: "Accueil", onClick: () => nav({ name: "clients" }) }} title={c.name} sub={[c.contact, c.phone].filter(Boolean).join(" · ") || undefined}
      actions={<>{c.phone && <a className="cx-btn cx-btn-secondary" href={`tel:${c.phone.replace(/\s/g, "")}`}><Phone size={15} aria-hidden="true" /><span>Appeler</span></a>}<MoreMenu iconOnly label="Autres actions" items={[{ label: "Voir le relevé du client", onClick: () => nav({ name: "situation", id: c.id }) }, { label: "Supprimer le client", hint: "Restaurable", onClick: () => setDel(true) }]} /></>} />
    <div className="cx-story-grid">
      <div className="cx-story-side">
        <section className="cx-card cx-sum" aria-label="Solde du client">
          <p className="cx-sum-label">{a.refund > 0 && !a.due ? "À rendre au client" : "Reste à payer"}</p>
          <p className="cx-sum-amount">{money(a.refund > 0 && !a.due ? a.refund : a.due)}</p>
          {a.total > 0 && <><div className="cx-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.round(paid / a.total * 100))}%` }} /></div>
          <p className="cx-sum-legend"><span>Payé {money(paid)}</span><span>Facturé {money(a.total)}</span></p>{a.credited > 0 && <p className="cx-sum-legend"><span>Avoirs − {money(a.credited)}</span></p>}</>}
        </section>
        <div className="cx-actionbar">
          <Button icon={<FilePlus2 size={16} aria-hidden="true" />} disabled={!d.officeOnline || !!c.archived} title={!d.officeOnline ? "Le bureau est hors ligne" : c.archived ? "Client archivé" : undefined} onClick={() => nav({ name: "nouvelle", id: c.id })}>Nouvelle facture</Button>
          {items.length > 0 && <Button kind="primary" icon={<Send size={15} aria-hidden="true" />} onClick={() => setAsk(true)}>Signaler un paiement</Button>}
        </div>
      </div>
      <div className="cx-story-main">
        <section aria-labelledby="inv-title"><h2 id="inv-title" className="cx-sec-title">Factures non soldées</h2>
          <div className="cx-card cx-card-flush">{open.length ? <div className="cx-rows">{open.map(inv)}</div> : <p className="cx-fold-note">Tout est payé.</p>}
            {done.length > 0 && <details className="cx-fold"><summary><span>Factures soldées <em>({done.length})</em></span></summary><div className="cx-rows">{done.map(inv)}</div></details>}</div></section>
        <section aria-labelledby="pay-title"><h2 id="pay-title" className="cx-sec-title">Paiements reçus</h2>
          <div className="cx-card cx-card-flush cx-list">{pays.map(p => <PaymentRow key={p.id} p={p} by={by} />)}{!pays.length && <p className="cx-fold-note">Aucun paiement enregistré.</p>}</div></section>
        {reqs.length > 0 && <section aria-labelledby="req-title"><h2 id="req-title" className="cx-sec-title">Vos demandes pour ce client</h2><div className="cx-card cx-card-flush cx-list">{reqs.map(r => <RequestRow key={r.id} r={r} />)}</div></section>}
        <details className="cx-fold cx-card"><summary><span>Historique du client</span></summary><div className="cx-fold-body"><Timeline events={d.events.filter(e => e.clientId === id).slice(0, 30)} /></div></details>
      </div>
    </div>
    {ask && <RequestForm kind="paiement" client={c} by={by} onClose={() => setAsk(false)} />}
    {del && <DeleteDialog target={{ collection: "clients", id: c.id }} by={by} onClose={() => setDel(false)} onDone={() => nav({ name: "clients" })} />}
  </div>;
}
function PaymentRow({ p, by }: { p: Snapshot["payments"][number]; by: string }) {
  const d = useData(), i = d.snapshot.invoices.find(x => x.id === p.invoiceId), [ask, setAsk] = useState(false), [lift, setLift] = useState<"unlock-payment" | "restore-payment" | null>(null), [del, setDel] = useState(false);
  return <div className={`cx-list-row cx-static${p.cancelledAt ? " cx-cancelled" : ""}`}>
    <span className="cx-list-main"><strong>{money(p.amount)} · {methodName(p.method)}</strong><small>{dateFr(p.date)} · facture {i?.number}{p.reference ? ` · ${p.reference}` : ""} · saisi par {accountName(p.by)}</small>{p.changedAfterLock && !p.lockedAt && <span className="cx-chip cx-tone-warn">Modifié après validation</span>}</span>
    <span className="cx-list-actions">{p.cancelledAt ? <><Stamp tone="bad">Annulé</Stamp><button type="button" className="cx-text-btn" onClick={() => setLift("restore-payment")}>Rétablir</button></>
      : p.lockedAt ? <><Stamp tone="good"><Lock size={12} aria-hidden="true" />Validé</Stamp><button type="button" className="cx-text-btn" onClick={() => setLift("unlock-payment")}>Déverrouiller</button></>
      : <Button size="sm" disabled={!d.officeOnline} title={!d.officeOnline ? "Le bureau est hors ligne" : undefined} onClick={() => setAsk(true)}>Valider</Button>}<button type="button" className="cx-text-btn" onClick={() => setDel(true)}>Supprimer</button></span>
    {del && <DeleteDialog target={{ collection: "payments", id: p.id }} by={by} onClose={() => setDel(false)} />}
    {ask && <Confirm title={`Valider ce paiement de ${money(p.amount)} ?`} confirm="Valider le paiement" cancel="Pas maintenant" onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); if (validate([], [p.id], by)) toast("Paiement validé."); }}><p>Une fois validé, l’encaissement ne pourra plus le corriger ni l’annuler. Vous pourrez le déverrouiller si besoin.</p></Confirm>}
    {lift === "unlock-payment" && <LiftDialog title={`Déverrouiller ce paiement de ${money(p.amount)} ?`} effect="L’encaissement pourra de nouveau le corriger ou l’annuler. Il reviendra dans vos éléments à valider." confirm="Déverrouiller" onClose={() => setLift(null)} onConfirm={r => { liftRule(by, "unlock-payment", p.id, r); setLift(null); toast("Paiement déverrouillé."); }} />}
    {lift === "restore-payment" && <LiftDialog title={`Rétablir ce paiement de ${money(p.amount)} ?`} effect="Il comptera de nouveau dans le solde du client. Son annulation reste dans l’historique." confirm="Rétablir le paiement" onClose={() => setLift(null)} onConfirm={r => { liftRule(by, "restore-payment", p.id, r); setLift(null); toast("Paiement rétabli."); }} />}
  </div>;
}
function RequestRow({ r }: { r: Request }) {
  return <div className="cx-list-row cx-static"><span className="cx-list-main"><strong>{REQUEST_LABEL[r.kind]}{r.amount ? `, ${money(r.amount)}` : ""}</strong><small>{r.invoiceNumber ? `Facture ${r.invoiceNumber}. ` : `${r.clientName}. `}Envoyée le {timeFr(r.createdAt)}{r.response ? `. Réponse : ${r.response}` : ""}</small></span><RequestState r={r} /></div>;
}

/** Direction → team: a payment to check, a client to create. Invoices are read directly on the Factures page. */
function RequestForm({ kind, client, invoiceId, by, onClose }: { kind: Exclude<RequestKind, "facture">; client?: Client; invoiceId?: string; by: string; onClose: () => void }) {
  const d = getData(), s = d.snapshot, items = client ? s.invoices.filter(i => i.client.id === client.id) : [];
  const [inv, setInv] = useState(invoiceId ?? items.find(i => balance(i, s.payments, s.credits).due > 0)?.id ?? items[0]?.id ?? ""), [amount, setAmount] = useState(0), [date, setDate] = useState(todayIso()), [method, setMethod] = useState(METHODS[0]), [reference, setReference] = useState(""), [message, setMessage] = useState("");
  const [nc, setNc] = useState<Partial<Client>>({ name: "", contact: "", phone: "", address: "" }), [error, setError] = useState("");
  function submit() {
    if (kind === "paiement") { const i = items.find(x => x.id === inv); if (!i) return setError("Choisissez la facture."); if (!amount) return setError("Écrivez le montant que le client dit avoir payé."); if (!date) return setError("Choisissez la date du paiement.");
      send({ kind, to: "encaissement", clientId: client!.id, clientName: client!.name, invoiceId: i.id, invoiceNumber: i.number, amount, paymentDate: date, method, reference: reference.trim(), message: message.trim() }, by); }
    else { if (!nc.name?.trim()) return setError("Écrivez le nom du client."); send({ kind, to: "facturation", clientName: nc.name.trim(), newClient: { ...nc, name: nc.name.trim() }, message: message.trim() }, by); }
    onClose();
  }
  const title = kind === "paiement" ? "Signaler un paiement" : "Demander un nouveau client";
  const sub = kind === "paiement" ? `${client?.name}. L’encaissement vérifie, puis l’enregistre.` : "La facturation crée la fiche du client.";
  return <Modal side title={title} subtitle={sub} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" icon={<Send size={16} aria-hidden="true" />} onClick={submit}>Envoyer la demande</Button></>}>
    {kind === "paiement" && <>
      {items.length > 1 && <Field label="Pour quelle facture ?" required><Choice columns={2} value={inv} onChange={setInv} options={items.map(i => ({ value: i.id, label: i.number, sub: `reste ${money(balance(i, s.payments, s.credits).due)}` }))} /></Field>}
      <div className="cx-form-grid"><Field label="Montant payé" required><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field><Field label="Payé le" required><DateInput value={date} max={todayIso()} onChange={setDate} /></Field></div>
      <Field label="Mode de paiement" required><Choice columns={5} value={method} onChange={setMethod} options={METHODS.map(m => ({ value: m, label: m }))} /></Field>
      <div className="cx-form-grid"><Field label="Référence" optional><TextInput value={reference} onChange={setReference} /></Field><Field label="Message" optional><TextInput value={message} onChange={setMessage} placeholder="Ex. viré lundi…" /></Field></div>
      <p className="cx-hint">Cela n’enregistre pas le paiement : l’encaissement le vérifie d’abord.</p>
    </>}
    {kind === "client" && <div className="cx-form-grid">
      <Field label="Nom du client" required wide><TextInput value={nc.name ?? ""} onChange={v => setNc({ ...nc, name: v })} autoFocus /></Field>
      <Field label="Personne à contacter" optional><TextInput value={nc.contact ?? ""} onChange={v => setNc({ ...nc, contact: v })} /></Field>
      <Field label="Téléphone" optional><TextInput value={nc.phone ?? ""} onChange={v => setNc({ ...nc, phone: v })} inputMode="tel" /></Field>
      <Field label="Adresse" optional wide><TextInput value={nc.address ?? ""} onChange={v => setNc({ ...nc, address: v })} /></Field>
      <Field label="Message" optional wide><TextArea rows={2} value={message} onChange={setMessage} /></Field>
    </div>}
    {!d.officeOnline && <Notice tone="warn">Le bureau est hors ligne : la demande partira à sa reconnexion.</Notice>}
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}

function InvoiceFlags({ i, issues, onFix }: { i: Invoice; issues: ReturnType<typeof findIssues>; onFix: () => void }) {
  const same = issues.sameNumber.get(i.id);
  return <>
    {same && <span className="cx-flag">Numéro en double : aussi utilisé par {same.map(x => `la facture de ${x.client.name} du ${dateFr(x.date)}`).join(", ")}.
      <button type="button" className="cx-link-btn" onClick={e => { e.preventDefault(); onFix(); }}>Corriger le numéro</button></span>}
    {issues.afterClose.has(i.id) && <span className="cx-flag">Faite dans un mois déjà clôturé ({monthLabel(i.date.slice(0, 7))}), sur un ordinateur qui ne le savait pas encore. Elle est gardée : vérifiez-la avant de valider.</span>}
  </>;
}
/** A number used twice is corrected by the Direction; the previous version stays in the invoice's history. */
function FixNumber({ invoice, by, onClose }: { invoice: Invoice; by: string; onClose: () => void }) {
  const [number, setNumber] = useState(invoice.number), [error, setError] = useState("");
  function save() {
    const n = number.trim(), cur = getData();
    if (!n) return setError("Écrivez le nouveau numéro.");
    if (n.length > 40) return setError("Ce numéro est trop long (40 caractères au plus).");
    const other = cur.invoices.find(x => x.id !== invoice.id && numberKey(x.number) === numberKey(n));
    if (other) return setError(`Ce numéro est déjà celui de la facture de ${other.client.name} du ${dateFr(other.date)}.`);
    const stamp = nowIso(), now = cur.invoices.find(x => x.id === invoice.id)!, { history, ...previous } = now;
    commit(by, x => ({
      invoices: x.invoices.map(y => y.id === invoice.id ? { ...y, number: n, revisedAt: stamp, history: [...(history ?? []), { ...previous, savedAt: stamp }] as Invoice["history"] } : y),
      credits: x.credits.map(c => c.invoiceId === invoice.id ? { ...c, invoiceNumber: n } : c),
    }), { text: `Numéro de facture corrigé : ${invoice.number} → ${n}`, clientId: invoice.client.id, invoiceId: invoice.id });
    toast(`Numéro corrigé : ${n}.`); onClose();
  }
  return <Modal title={`Corriger le numéro ${invoice.number}`} subtitle={`${invoice.client.name}, facture du ${dateFr(invoice.date)}`} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={save}>Enregistrer le numéro</Button></>}>
    <Field label="Nouveau numéro" required error={error || undefined} hint="Le numéro imprimé change. L’ancienne version reste dans l’historique de la facture."><TextInput value={number} onChange={v => { setNumber(v); setError(""); }} autoFocus /></Field>
  </Modal>;
}

/** One tab for invoices: what is new since the last validation on top, then every invoice month by month.
 *  Validating is a review, never a gate: an invoice or payment not validated counts everywhere like the others. */
function Invoices({ nav, by }: { nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, [month, setMonth] = useState(() => todayIso().slice(0, 7)), [q, setQ] = useState("");
  const bills = newInvoices(s), pays = newPayments(s), keys = [...bills.map(i => "i:" + i.id), ...pays.map(p => "p:" + p.id)];
  // Items that need a second look are not ticked by default: « Valider » never passes them without anyone looking.
  const issues = findIssues(s), flagged = (k: string) => k.startsWith("p:") ? issues.twinOf.has(k.slice(2)) : issues.sameNumber.has(k.slice(2)) || issues.afterClose.has(k.slice(2));
  const [fix, setFix] = useState<Invoice | null>(null), [cancel, setCancel] = useState<Payment | null>(null);
  // Everything new is ticked until the Direction changes the selection (items can arrive after the page opened).
  const [picked, setSel] = useState<string[] | null>(null), sel = picked ?? keys.filter(k => !flagged(k)), [confirm, setConfirm] = useState(false);
  const chosenBills = bills.filter(i => sel.includes("i:" + i.id)), chosenPays = pays.filter(p => sel.includes("p:" + p.id)), n = chosenBills.length + chosenPays.length, all = n === keys.length;
  const toggle = (k: string, on: boolean) => setSel(on ? [...sel, k] : sel.filter(x => x !== k));
  const searching = !!q.trim(), ofMonth = s.invoices.filter(i => i.date.startsWith(month));
  const list = (searching ? s.invoices.filter(i => matches(q, i.number, i.client.name)) : ofMonth).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const sum = (f: "total" | "received" | "due") => ofMonth.reduce((t, i) => t + balance(i, s.payments, s.credits)[f], 0);
  const open = (id: string) => nav({ name: "facture", id, extra: "factures" });
  const row = (i: typeof list[number]) => { const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id), late = overdueDays(i);
    return <Row key={i.id} title={<span className="cx-nowrap">{i.number}{i.legacy && <span className="cx-legacy-tag">Ancienne</span>}{issues.sameNumber.has(i.id) && <span className="cx-legacy-tag cx-tag-bad">Numéro en double</span>}</span>} sub={<><span>{i.client.name}</span><span>{dateFr(i.date)}{!dv && <> · <span className="cx-warn-text cx-nowrap">pas encore remise</span></>}</span></>}
      amount={money(b.total)} state={b.due > 0 && late > 0 ? <span className="cx-chip cx-tone-bad">{late} j de retard</span> : <StatusChip status={b.status} />} onClick={() => open(i.id)} />; };
  return <div className="cx-page cx-bills cx-validate">
    <PageHead title="Factures" sub="Les factures et paiements du bureau. Validez-les quand vous voulez : rien n’attend votre validation."
      actions={<><MoreMenu iconOnly label="Autres actions" items={[{ label: "Ajouter une ancienne facture", hint: "Faite avant l’application, avec son numéro d’origine", onClick: () => nav({ name: "nouvelle", extra: "ancienne" }) }]} /><Button kind="primary" icon={<Plus size={16} aria-hidden="true" />} disabled={!d.officeOnline} title={!d.officeOnline ? "Le bureau est hors ligne" : undefined} onClick={() => nav({ name: "nouvelle" })}>Nouvelle facture</Button></>} />
    {!d.officeOnline && <Notice tone="warn">Le bureau est hors ligne. La validation reprendra à sa reconnexion ; tout reste consultable.</Notice>}
    <div className="cx-validate-grid">
      <section aria-labelledby="new-title">
        <div className="cx-sec-head"><h2 id="new-title" className="cx-sec-title">Nouveau à valider</h2>{keys.length > 1 && <button type="button" className="cx-link-btn" onClick={() => setSel(all ? [] : keys)}>{all ? "Tout décocher" : "Tout cocher"}</button>}</div>
        {issues.count > 0 && <Notice tone="warn" title={`${issues.count} point${issues.count > 1 ? "s" : ""} à vérifier`}>{[issues.twinOf.size && `${issues.twinOf.size} paiement(s) qui ressemblent à un autre (doublon possible)`, issues.sameNumber.size && "des factures avec le même numéro", issues.afterClose.size && `${issues.afterClose.size} facture(s) faite(s) dans un mois déjà clôturé`].filter(Boolean).join(" ; ")}. Ils sont signalés en rouge ci-dessous et ne sont pas cochés. Rien n’est supprimé : vous décidez.</Notice>}
        {keys.length ? <div className="cx-pay-cards">
          {bills.map(i => { const on = sel.includes("i:" + i.id), b = balance(i, s.payments, s.credits); return <label key={i.id} className={`cx-pay-card${on ? " cx-on" : ""}`}>
            <input type="checkbox" checked={on} onChange={e => toggle("i:" + i.id, e.target.checked)} />
            <span className="cx-pay-body"><span className="cx-pay-top"><strong>{money(b.total)}</strong><span className={`cx-chip cx-tone-${i.revisedAt ? "warn" : "info"}`}>{i.revisedAt ? "Facture modifiée" : i.legacy ? "Ancienne facture" : "Nouvelle facture"}</span></span>
              <span className="cx-pay-who">{i.client.name} · facture {i.number}</span>
              <small>Émise le {dateFr(i.date)} par {accountName(i.createdBy)}{i.revisedAt ? ` · modifiée le ${dateFr(i.revisedAt)}` : ""}</small>
              <InvoiceFlags i={i} issues={issues} onFix={() => setFix(i)} />
              <button type="button" className="cx-link-btn cx-pay-open" onClick={e => { e.preventDefault(); open(i.id); }}>Voir la facture</button></span>
          </label>; })}
          {pays.map(p => { const i = s.invoices.find(x => x.id === p.invoiceId), on = sel.includes("p:" + p.id); return <label key={p.id} className={`cx-pay-card${on ? " cx-on" : ""}`}>
            <input type="checkbox" checked={on} onChange={e => toggle("p:" + p.id, e.target.checked)} />
            <span className="cx-pay-body"><span className="cx-pay-top"><strong>{money(p.amount)}</strong><span className={`cx-chip cx-tone-${p.changedAfterLock ? "warn" : "good"}`}>{p.changedAfterLock ? "Corrigé après validation" : `Paiement · ${methodName(p.method)}`}</span></span>
              <span className="cx-pay-who">{i?.client.name} · facture {i?.number}</span>
              <small>Payé le {dateFr(p.date)}{p.reference ? ` · réf. ${p.reference}` : ""} · saisi par {accountName(p.by)}{p.history?.length ? ` · corrigé ${p.history.length} fois` : ""}</small>
              {issues.twinOf.has(p.id) && (() => { const t = issues.twinOf.get(p.id)!; return <span className="cx-flag">Doublon possible : même montant que le paiement du {dateFr(t.date)} saisi par {accountName(t.by)}{t.lockedAt ? " (déjà validé)" : ""}.
                <button type="button" className="cx-link-btn" onClick={e => { e.preventDefault(); setCancel(p); }}>Annuler ce doublon</button></span>; })()}</span>
          </label>; })}
        </div> : <div className="cx-card"><Empty title="Tout est validé.">Les nouvelles factures et les nouveaux paiements du bureau apparaîtront ici.</Empty></div>}
        {keys.length > 0 && <p className="cx-validate-note">Un paiement validé ne peut plus être corrigé par l’encaissement. Une facture validée reste modifiable ; si elle change, elle revient ici.</p>}
        {keys.length > 0 && <div className="cx-actionbar cx-actionbar-total"><span><small>{n} élément{n > 1 ? "s" : ""} coché{n > 1 ? "s" : ""}</small><strong>{chosenBills.length} facture{chosenBills.length > 1 ? "s" : ""}, {chosenPays.length} paiement{chosenPays.length > 1 ? "s" : ""}</strong></span><Button kind="primary" disabled={!n || !d.officeOnline} onClick={() => setConfirm(true)}>Valider</Button></div>}
      </section>
      <section aria-labelledby="all-title">
        <h2 id="all-title" className="cx-sec-title">Toutes les factures</h2>
        <div className="cx-bills-tools"><MonthStepper value={month} onChange={v => { setMonth(v); setQ(""); }} /><SearchBox value={q} onChange={setQ} placeholder="Numéro ou client, tous les mois" /></div>
        {searching ? <p className="cx-bills-note">{list.length} facture{list.length > 1 ? "s" : ""} trouvée{list.length > 1 ? "s" : ""}, tous mois confondus.</p>
          : <dl className="cx-strip"><div><dt>Facturé en {monthLabel(month).split(" ")[0]}</dt><dd>{money(sum("total"))}</dd></div><div><dt>Encaissé</dt><dd>{money(sum("received"))}</dd></div><div><dt>Reste à recevoir</dt><dd className="cx-strong">{money(sum("due"))}</dd></div></dl>}
        <div className="cx-card cx-card-flush">{list.length ? <div className="cx-rows">{list.map(row)}</div>
          : <Empty title={searching ? "Aucune facture ne correspond." : `Aucune facture en ${monthLabel(month)}.`}>{searching ? "Essayez un autre numéro ou nom de client." : "Changez de mois avec les flèches."}</Empty>}</div>
      </section>
    </div>
    {fix && <FixNumber invoice={fix} by={by} onClose={() => setFix(null)} />}
    {cancel && <CancelPayment payment={cancel} by={by} onClose={() => setCancel(null)} />}
    {confirm && <Confirm title={`Valider ${n} élément${n > 1 ? "s" : ""} ?`} confirm="Valider" cancel="Pas maintenant" onClose={() => setConfirm(false)} onConfirm={() => { const done = validate(chosenBills.map(i => i.id), chosenPays.map(p => p.id), by); setConfirm(false); if (done) { toast(`${done} élément${done > 1 ? "s validés" : " validé"}.`); setSel(null); } }}>
      <ul className="cx-mini-list">{chosenBills.map(i => <li key={i.id}>Facture {i.number}, {money(balance(i, s.payments, s.credits).total)}, {i.client.name}</li>)}{chosenPays.map(p => <li key={p.id}>Paiement de {money(p.amount)}, {methodName(p.method)}, {s.invoices.find(x => x.id === p.invoiceId)?.client.name}</li>)}</ul>
      {chosenPays.length > 0 && <p>Les paiements validés ne pourront plus être corrigés ni annulés par l’encaissement.</p>}</Confirm>}
  </div>;
}

/** One invoice for the Direction: the whole A4 document, what is paid, whether it was handed over. */
function InvoiceSheet({ id, fromList, nav, by }: { id: string; fromList: boolean; nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, i = s.invoices.find(x => x.id === id), [ask, setAsk] = useState(false), [fix, setFix] = useState(false), [del, setDel] = useState<BinTarget | null>(null);
  if (!i) return <Empty title="Facture introuvable." action={<Button onClick={() => nav({ name: "factures" })}>Toutes les factures</Button>} />;
  const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id), client = s.clients.find(c => c.id === i.client.id) ?? i.client, pays = s.payments.filter(p => p.invoiceId === i.id);
  return <div className="cx-page cx-story">
    <PageHead back={fromList ? { label: "Factures", onClick: () => nav({ name: "factures" }) } : { label: i.client.name, onClick: () => nav({ name: "client", id: i.client.id }) }} title={`Facture ${i.number}`} sub={`${i.client.name}, ${i.legacy ? "ancienne facture du" : "émise le"} ${dateFr(i.date)}`}
      actions={<><Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button><MoreMenu iconOnly label="Autres actions" items={[{ label: "Exporter en Excel", onClick: () => exportInvoice(i, words) }, { label: `Voir le client ${i.client.name}`, onClick: () => nav({ name: "client", id: i.client.id }) }, { label: "Supprimer la facture", hint: "Restaurable", onClick: () => setDel({ collection: "invoices", id: i.id }) }]} /></>} />
    {(() => { const issues = findIssues(s); return (issues.sameNumber.has(i.id) || issues.afterClose.has(i.id)) && <div className="cx-flags-block cx-noprint"><InvoiceFlags i={i} issues={issues} onFix={() => setFix(true)} /></div>; })()}
    {fix && <FixNumber invoice={i} by={by} onClose={() => setFix(false)} />}
    <div className="cx-story-grid">
      <div className="cx-story-side cx-noprint">
        <section className="cx-card cx-sum" aria-label="Paiement de la facture">
          <p className="cx-sum-label">{b.refund > 0 ? "À rendre au client" : "Reste à payer"}</p>
          <p className="cx-sum-amount">{money(b.refund || b.due)}</p>
          <dl className="cx-sum-kv">
            <div><dt>Paiement</dt><dd><StatusChip status={b.status} /></dd></div>
            <div><dt>Montant</dt><dd>{money(b.total)}</dd></div>
            <div><dt>Reçu</dt><dd>{money(b.received)}</dd></div>
            {b.credited > 0 && <div><dt>Avoirs</dt><dd>− {money(b.credited)}</dd></div>}
            <div><dt>Échéance</dt><dd className={b.due > 0 && overdueDays(i) > 0 ? "cx-bad-text" : ""}>{dateFr(dueDateOf(i))}{b.due > 0 && overdueDays(i) > 0 ? `, ${overdueDays(i)} j de retard` : ""}</dd></div>
            <div><dt>Remise au client</dt><dd className={dv ? "" : "cx-warn-text"}>{dv ? `Le ${dateFr(dv.declaredAt)}` : "Pas encore"}</dd></div>
            <div><dt>Votre validation</dt><dd>{i.validatedAt ? <span className="cx-chip cx-tone-good">Validée le {dateFr(i.validatedAt)}</span> : <Button size="sm" disabled={!d.officeOnline} title={!d.officeOnline ? "Le bureau est hors ligne" : undefined} onClick={() => { if (validate([i.id], [], by)) toast("Facture validée."); }}>Valider</Button>}</dd></div>
          </dl>
        </section>
        {b.due > 0 && <div className="cx-actionbar"><Button kind="primary" icon={<Send size={15} aria-hidden="true" />} onClick={() => setAsk(true)}>Signaler un paiement</Button></div>}
      </div>
      <div className="cx-story-main">
        <section aria-label="Le document"><Paper invoice={i} title={`Facture ${i.number}`} /></section>
        <section className="cx-noprint" aria-labelledby="sheet-pay"><h2 id="sheet-pay" className="cx-sec-title">Paiements reçus</h2>
          <div className="cx-card cx-card-flush cx-list">{pays.map(p => <PaymentRow key={p.id} p={p} by={by} />)}{!pays.length && <p className="cx-fold-note">{i.advance ? `Avance de ${money(i.advance)} versée à la facturation.` : "Aucun paiement pour l’instant."}</p>}</div></section>
        <details className="cx-fold cx-card"><summary><span>Historique de la facture</span></summary><div className="cx-fold-body"><Timeline events={d.events.filter(e => e.invoiceId === i.id)} /></div></details>
      </div>
    </div>
    {ask && <RequestForm kind="paiement" client={client as Client} invoiceId={i.id} by={by} onClose={() => setAsk(false)} />}
    {del && <DeleteDialog target={del} by={by} onClose={() => setDel(null)} onDone={() => nav(fromList ? { name: "factures" } : { name: "client", id: i.client.id })} />}
  </div>;
}
