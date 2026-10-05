import { useState } from "react";
import { Check, ChevronRight, ClipboardCheck, Clock, Copy, KeyRound, Lock, Phone, Send, UserPlus, WifiOff } from "lucide-react";
import { Button, Choice, Confirm, DateInput, Empty, Field, Modal, Monogram, MoneyInput, MoreMenu, Notice, PageHead, Paper, Row, SearchBox, Stamp, StatusChip, TextArea, TextInput, Timeline, matches, toast } from "./ui";
import { RequestState, Situation } from "./office";
import { BackupSettings, CompanySettings, FormatSettings } from "./settings";
import { METHODS, REQUEST_LABEL, ROLE_LABEL, accountName, accountTotals, ago, balance, commit, dateFr, daysSince, delivery, generateLogin, generatePassword, getData, methodName, money, nowIso, resetDemo, setOnline, timeFr, todayIso, uid, useData } from "./store";
import type { Account, Client, Request, RequestKind, Role, Snapshot } from "./store";

export type RRoute = { name: "clients" | "client" | "facture" | "valider" | "situation" | "reglages"; id?: string };
type Nav = (r: RRoute) => void;

export function ResponsableScreen({ route, nav, by }: { route: RRoute; nav: Nav; by: string }) {
  switch (route.name) {
    case "client": return <ClientStory id={route.id!} nav={nav} by={by} />;
    case "facture": return <InvoiceSheet id={route.id!} nav={nav} by={by} />;
    case "valider": return <Validate nav={nav} by={by} />;
    case "situation": return <GlobalSituation key={route.id ?? "all"} clientId={route.id ?? ""} />;
    case "reglages": return <Settings by={by} />;
    default: return <Overview nav={nav} by={by} />;
  }
}
export function pendingCount(d: { snapshot: Snapshot }) { return d.snapshot.payments.filter(p => !p.lockedAt && !p.cancelledAt).length; }
function GlobalSituation({ clientId }: { clientId: string }) { const d = useData(); return <Situation data={{ ...d.snapshot, format: d.format }} clientId={clientId} />; }

/** Lock payments. Only while the office is connected and the payment matches what the office holds. */
function lock(ids: string[], by: string) {
  const d = getData(); if (!d.officeOnline) { toast("Le bureau est hors ligne : la validation attendra sa reconnexion.", "warn"); return 0; }
  const ok = ids.filter(id => { const k = d.snapshot.payments.find(p => p.id === id), l = d.payments.find(p => p.id === id); return k && l && !k.cancelledAt && !l.cancelledAt && !l.lockedAt && k.amount === l.amount && k.date === l.date && k.method === l.method && k.reference === l.reference; });
  if (!ok.length) { toast("Ces paiements ont changé au bureau. Rechargez la page, puis validez.", "warn"); return 0; }
  const at = nowIso();
  commit(by, x => ({ payments: x.payments.map(p => ok.includes(p.id) ? { ...p, lockedAt: at } : p), events: [...ok.map(id => { const p = d.payments.find(y => y.id === id)!, i = d.invoices.find(y => y.id === p.invoiceId); return { id: uid(), at, by, text: `Paiement de ${money(p.amount)} validé`, clientId: i?.client.id, invoiceId: p.invoiceId }; }), ...x.events] }));
  return ok.length;
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
    const lateDue = open.filter(i => daysSince(i.date) > 30).reduce((n, i) => n + balance(i, s.payments, s.credits).due, 0);
    const mine = s.payments.filter(p => !p.cancelledAt && items.some(i => i.id === p.invoiceId)), last = [...mine].sort((x, y) => y.date.localeCompare(x.date))[0];
    return { c, a: accountTotals(items, s.payments, s.credits), count: items.length, oldest: open.length ? Math.max(...open.map(i => daysSince(i.date))) : 0, lateDue, last, pending: mine.some(p => !p.lockedAt) };
  });
  const total = rows.reduce((n, r) => n + r.a.due, 0), late = rows.reduce((n, r) => n + r.lateDue, 0), toLock = s.payments.filter(p => !p.lockedAt && !p.cancelledAt);
  const lateClients = rows.filter(r => r.oldest > 60).sort((a, b) => b.lateDue - a.lateDue);
  const hits = q.trim().length >= 3 ? s.invoices.filter(i => matches(q, i.number)) : [];
  const list = rows.filter(r => matches(q, r.c.name, r.c.phone, r.c.contact)).sort((a, b) => b.a.due - a.a.due || a.c.name.localeCompare(b.c.name));
  const owing = list.filter(r => r.a.due > 0 || r.a.refund > 0), settled = list.filter(r => !r.a.due && !r.a.refund);
  const sub = (r: typeof rows[number]) => r.oldest > 30 ? <span className={r.oldest > 60 ? "cx-bad-text" : "cx-warn-text"}>En retard de {r.oldest} jours</span> : r.pending ? <span className="cx-warn-text">Paiement à valider</span> : r.last ? `Dernier paiement le ${dateFr(r.last.date)}` : r.count ? `${r.count} facture${r.count > 1 ? "s" : ""}` : "Aucune facture";
  const row = (r: typeof rows[number]) => <Row key={r.c.id} lead={<Monogram name={r.c.name} />} title={r.c.name} sub={<span>{sub(r)}</span>} amount={r.a.due ? money(r.a.due) : r.a.refund ? `${money(r.a.refund)} à rendre` : undefined} onClick={() => nav({ name: "client", id: r.c.id })} />;
  return <div className="cx-page cx-home">
    <div className="cx-home-side">
      <section className="cx-hero" aria-label="Total à recevoir">
        <p className="cx-hero-top"><span>Il reste à recevoir</span><span className="cx-hero-fresh">{d.officeOnline ? <><i aria-hidden="true" />Bureau {ago(s.receivedAt)}</> : <><WifiOff size={13} aria-hidden="true" />Bureau hors ligne</>}</span></p>
        <p className="cx-hero-amount">{money(total).replace(/\s*FCFA$/, "")} <small>FCFA</small></p>
        {total > 0 && <><div className="cx-aging" aria-hidden="true"><span style={{ flexGrow: total - late }} /><span className="cx-aging-late" style={{ flexGrow: late }} /></div>
        <p className="cx-aging-legend"><span><i />À jour {money(total - late)}</span><span><i className="cx-aging-late" />En retard {money(late)}</span></p></>}
      </section>
      {(toLock.length > 0 || lateClients.length > 0) && <section aria-labelledby="todo"><h2 id="todo" className="cx-sec-title">À faire</h2>
        <div className="cx-card cx-card-flush cx-rows">
          {toLock.length > 0 && <Row lead={<span className="cx-task-icon"><ClipboardCheck size={18} aria-hidden="true" /></span>} title={`Valider ${toLock.length} paiement${toLock.length > 1 ? "s" : ""}`} sub={<span>{money(toLock.reduce((n, p) => n + p.amount, 0))} saisis par l’encaissement</span>} state={<ChevronRight size={18} className="cx-go" aria-hidden="true" />} onClick={() => nav({ name: "valider" })} />}
          {lateClients.slice(0, 2).map(r => <Row key={r.c.id} lead={<span className="cx-task-icon cx-task-bad"><Clock size={18} aria-hidden="true" /></span>} title={`Relancer ${r.c.name}`} sub={<span>{money(r.lateDue)} dus depuis {r.oldest} jours</span>} state={<ChevronRight size={18} className="cx-go" aria-hidden="true" />} onClick={() => nav({ name: "client", id: r.c.id })} />)}
        </div></section>}
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
  const d = useData(), s = d.snapshot, c = s.clients.find(x => x.id === id), [ask, setAsk] = useState<{ kind: RequestKind; invoiceId?: string } | null>(null);
  if (!c) return <Empty title="Client introuvable." action={<Button onClick={() => nav({ name: "clients" })}>Accueil</Button>} />;
  const items = s.invoices.filter(i => i.client.id === c.id).sort((a, b) => b.date.localeCompare(a.date)), a = accountTotals(items, s.payments, s.credits);
  const open = items.filter(i => balance(i, s.payments, s.credits).due > 0), done = items.filter(i => !balance(i, s.payments, s.credits).due);
  const pays = s.payments.filter(p => items.some(i => i.id === p.invoiceId)).sort((x, y) => y.date.localeCompare(x.date)), reqs = d.requests.filter(r => r.clientId === c.id);
  const inv = (i: typeof items[number]) => { const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id), age = daysSince(i.date);
    return <Row key={i.id} title={<span className="cx-nowrap">{i.number}</span>} sub={<><span>{dateFr(i.date)}</span>{!dv && <span className="cx-warn-text">pas encore remise au client</span>}</>}
      amount={b.due ? money(b.due) : money(b.total)} state={b.due > 0 && age > 30 ? <span className={`cx-chip cx-tone-${age > 60 ? "bad" : "warn"}`}>{age} j de retard</span> : <StatusChip status={b.status} />} onClick={() => nav({ name: "facture", id: i.id })} />; };
  const paid = Math.max(0, a.total - a.credited - a.due);
  return <div className="cx-page cx-story">
    <PageHead back={{ label: "Accueil", onClick: () => nav({ name: "clients" }) }} title={c.name} sub={[c.contact, c.phone].filter(Boolean).join(" · ") || undefined}
      actions={<>{c.phone && <a className="cx-btn cx-btn-secondary" href={`tel:${c.phone.replace(/\s/g, "")}`}><Phone size={15} aria-hidden="true" /><span>Appeler</span></a>}<MoreMenu iconOnly label="Autres actions" items={[{ label: "Voir le relevé du client", onClick: () => nav({ name: "situation", id: c.id }) }]} /></>} />
    <div className="cx-story-grid">
      <div className="cx-story-side">
        <section className="cx-card cx-sum" aria-label="Solde du client">
          <p className="cx-sum-label">{a.refund > 0 && !a.due ? "À rendre au client" : "Reste à payer"}</p>
          <p className="cx-sum-amount">{money(a.refund > 0 && !a.due ? a.refund : a.due)}</p>
          {a.total > 0 && <><div className="cx-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.round(paid / a.total * 100))}%` }} /></div>
          <p className="cx-sum-legend"><span>Payé {money(paid)}</span><span>Facturé {money(a.total)}</span></p>{a.credited > 0 && <p className="cx-sum-legend"><span>Avoirs − {money(a.credited)}</span></p>}</>}
        </section>
        <div className="cx-actionbar">
          <Button onClick={() => setAsk({ kind: "facture" })}>Demander une facture</Button>
          <Button kind="primary" icon={<Send size={15} aria-hidden="true" />} disabled={!items.length} onClick={() => setAsk({ kind: "paiement" })}>Signaler un paiement</Button>
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
    {ask && <RequestForm kind={ask.kind} client={c} invoiceId={ask.invoiceId} by={by} onClose={() => setAsk(null)} />}
  </div>;
}
function PaymentRow({ p, by }: { p: Snapshot["payments"][number]; by: string }) {
  const d = useData(), i = d.snapshot.invoices.find(x => x.id === p.invoiceId), [ask, setAsk] = useState(false);
  return <div className={`cx-list-row cx-static${p.cancelledAt ? " cx-cancelled" : ""}`}>
    <span className="cx-list-main"><strong>{money(p.amount)} · {methodName(p.method)}</strong><small>{dateFr(p.date)} · facture {i?.number}{p.reference ? ` · ${p.reference}` : ""} · saisi par {accountName(p.by)}</small></span>
    <span className="cx-list-actions">{p.cancelledAt ? <Stamp tone="bad">Annulé</Stamp> : p.lockedAt ? <Stamp tone="good"><Lock size={12} aria-hidden="true" />Validé</Stamp> : <Button size="sm" disabled={!d.officeOnline} title={!d.officeOnline ? "Le bureau est hors ligne" : undefined} onClick={() => setAsk(true)}>Valider</Button>}</span>
    {ask && <Confirm title={`Valider ce paiement de ${money(p.amount)} ?`} confirm="Valider le paiement" cancel="Pas maintenant" onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); if (lock([p.id], by)) toast("Paiement validé."); }}><p>Une fois validé, l’encaissement ne pourra plus le corriger ni l’annuler.</p></Confirm>}
  </div>;
}
function RequestRow({ r }: { r: Request }) {
  return <div className="cx-list-row cx-static"><span className="cx-list-main"><strong>{REQUEST_LABEL[r.kind]}{r.amount ? `, ${money(r.amount)}` : ""}</strong><small>{r.invoiceNumber ? `Facture ${r.invoiceNumber}. ` : `${r.clientName}. `}Envoyée le {timeFr(r.createdAt)}{r.response ? `. Réponse : ${r.response}` : ""}</small></span><RequestState r={r} /></div>;
}

/** Direction → team: a payment to check, an invoice to create, a client to create. */
function RequestForm({ kind, client, invoiceId, by, onClose }: { kind: RequestKind; client?: Client; invoiceId?: string; by: string; onClose: () => void }) {
  const d = getData(), s = d.snapshot, items = client ? s.invoices.filter(i => i.client.id === client.id) : [];
  const [inv, setInv] = useState(invoiceId ?? items.find(i => balance(i, s.payments, s.credits).due > 0)?.id ?? items[0]?.id ?? ""), [amount, setAmount] = useState(0), [date, setDate] = useState(todayIso()), [method, setMethod] = useState(METHODS[0]), [reference, setReference] = useState(""), [message, setMessage] = useState("");
  const [nc, setNc] = useState<Partial<Client>>({ name: "", contact: "", phone: "", address: "" }), [error, setError] = useState("");
  function submit() {
    if (kind === "paiement") { const i = items.find(x => x.id === inv); if (!i) return setError("Choisissez la facture."); if (!amount) return setError("Écrivez le montant que le client dit avoir payé."); if (!date) return setError("Choisissez la date du paiement.");
      send({ kind, to: "encaissement", clientId: client!.id, clientName: client!.name, invoiceId: i.id, invoiceNumber: i.number, amount, paymentDate: date, method, reference: reference.trim(), message: message.trim() }, by); }
    else if (kind === "facture") { if (!message.trim()) return setError("Écrivez ce qu’il faut facturer."); send({ kind, to: "facturation", clientId: client!.id, clientName: client!.name, amount: amount || undefined, message: message.trim() }, by); }
    else { if (!nc.name?.trim()) return setError("Écrivez le nom du client."); send({ kind, to: "facturation", clientName: nc.name.trim(), newClient: { ...nc, name: nc.name.trim() }, message: message.trim() }, by); }
    onClose();
  }
  const title = kind === "paiement" ? "Signaler un paiement" : kind === "facture" ? "Demander une facture" : "Demander un nouveau client";
  const sub = kind === "paiement" ? `${client?.name}. L’encaissement vérifie, puis l’enregistre.` : kind === "facture" ? `${client?.name}. La facturation crée la facture.` : "La facturation crée la fiche du client.";
  return <Modal side title={title} subtitle={sub} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" icon={<Send size={16} aria-hidden="true" />} onClick={submit}>Envoyer la demande</Button></>}>
    {kind === "paiement" && <>
      {items.length > 1 && <Field label="Pour quelle facture ?" required><Choice columns={2} value={inv} onChange={setInv} options={items.map(i => ({ value: i.id, label: i.number, sub: `reste ${money(balance(i, s.payments, s.credits).due)}` }))} /></Field>}
      <div className="cx-form-grid"><Field label="Montant payé" required><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field><Field label="Payé le" required><DateInput value={date} max={todayIso()} onChange={setDate} /></Field></div>
      <Field label="Mode de paiement" required><Choice columns={5} value={method} onChange={setMethod} options={METHODS.map(m => ({ value: m, label: m }))} /></Field>
      <div className="cx-form-grid"><Field label="Référence" optional><TextInput value={reference} onChange={setReference} /></Field><Field label="Message" optional><TextInput value={message} onChange={setMessage} placeholder="Ex. viré lundi…" /></Field></div>
      <p className="cx-hint">Cela n’enregistre pas le paiement : l’encaissement le vérifie d’abord.</p>
    </>}
    {kind === "facture" && <>
      <Field label="Que faut-il facturer ?" required hint="Prestations, quantités, destination, bon de commande."><TextArea rows={4} value={message} onChange={setMessage} placeholder="Ex. traitement de 3 conteneurs pour Kolkata, BC-2026-021…" /></Field>
      <Field label="Montant prévu" optional><MoneyInput value={amount} onChange={setAmount} /></Field>
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

function InvoiceSheet({ id, nav, by }: { id: string; nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, i = s.invoices.find(x => x.id === id), [ask, setAsk] = useState(false);
  if (!i) return <Empty title="Facture introuvable." />;
  const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id), client = s.clients.find(c => c.id === i.client.id) ?? i.client;
  return <div className="cx-page">
    <PageHead back={{ label: i.client.name, onClick: () => nav({ name: "client", id: i.client.id }) }} title={`Facture ${i.number}`} sub={`Émise le ${dateFr(i.date)}, il y a ${daysSince(i.date)} jours`}
      actions={b.due > 0 ? <Button kind="primary" icon={<Send size={17} aria-hidden="true" />} onClick={() => setAsk(true)}>Signaler un paiement</Button> : undefined} />
    <dl className="cx-facts"><div><dt>Paiement</dt><dd><StatusChip status={b.status} /></dd></div><div><dt>Montant</dt><dd>{money(b.total)}</dd></div><div><dt>Reçu</dt><dd>{money(b.received)}</dd></div><div><dt>Reste à payer</dt><dd className="cx-strong">{money(b.due)}</dd></div></dl>
    <p className={dv ? "cx-good-text" : "cx-warn-text"}>{dv ? <><Check size={16} aria-hidden="true" />Remise au client le {dateFr(dv.declaredAt)} par {accountName(dv.by)}</> : "Pas encore remise au client."}</p>
    <section className="cx-section"><div className="cx-section-head"><h2>Paiements</h2></div><div className="cx-panel cx-list">{s.payments.filter(p => p.invoiceId === i.id).map(p => <PaymentRow key={p.id} p={p} by={by} />)}{!s.payments.some(p => p.invoiceId === i.id) && <Empty title={i.advance ? `Avance de ${money(i.advance)} à la facturation.` : "Aucun paiement."} />}</div></section>
    <details className="cx-disclosure"><summary>Voir la facture</summary><Paper invoice={i} /></details>
    <details className="cx-disclosure"><summary>Historique de la facture</summary><Timeline events={d.events.filter(e => e.invoiceId === i.id)} /></details>
    {ask && <RequestForm kind="paiement" client={client as Client} invoiceId={i.id} by={by} onClose={() => setAsk(false)} />}
  </div>;
}

function Validate({ nav, by }: { nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, waiting = s.payments.filter(p => !p.lockedAt && !p.cancelledAt).sort((a, b) => a.date.localeCompare(b.date));
  const [sel, setSel] = useState<string[]>(() => waiting.map(p => p.id)), [confirm, setConfirm] = useState(false);
  const chosen = waiting.filter(p => sel.includes(p.id)), sum = chosen.reduce((n, p) => n + p.amount, 0), reqs = [...d.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const all = chosen.length === waiting.length;
  return <div className="cx-page cx-validate">
    <PageHead title="À valider" sub="Un paiement validé ne peut plus être modifié par l’encaissement." />
    {!d.officeOnline && <Notice tone="warn">Le bureau est hors ligne. La validation reprendra à sa reconnexion.</Notice>}
    <div className="cx-validate-grid">
      <section aria-labelledby="pay-title">
        <div className="cx-sec-head"><h2 id="pay-title" className="cx-sec-title">Paiements saisis</h2>{waiting.length > 1 && <button type="button" className="cx-link-btn" onClick={() => setSel(all ? [] : waiting.map(p => p.id))}>{all ? "Tout décocher" : "Tout cocher"}</button>}</div>
        {waiting.length ? <div className="cx-pay-cards">{waiting.map(p => { const i = s.invoices.find(x => x.id === p.invoiceId), on = sel.includes(p.id); return <label key={p.id} className={`cx-pay-card${on ? " cx-on" : ""}`}>
          <input type="checkbox" checked={on} onChange={e => setSel(v => e.target.checked ? [...v, p.id] : v.filter(x => x !== p.id))} />
          <span className="cx-pay-body"><span className="cx-pay-top"><strong>{money(p.amount)}</strong><span>{methodName(p.method)}</span></span>
            <span className="cx-pay-who">{i?.client.name} · facture {i?.number}</span>
            <small>Payé le {dateFr(p.date)}{p.reference ? ` · réf. ${p.reference}` : ""} · saisi par {accountName(p.by)}{p.history?.length ? ` · corrigé ${p.history.length} fois` : ""}</small></span>
        </label>; })}</div> : <div className="cx-card"><Empty title="Tout est validé." /></div>}
      </section>
      <section aria-labelledby="req-title"><h2 id="req-title" className="cx-sec-title">Vos demandes au bureau</h2>
        <div className="cx-card cx-card-flush cx-rows">{reqs.map(r => <Row key={r.id} title={`${REQUEST_LABEL[r.kind]}`} sub={<span>{r.clientName}{r.amount ? ` · ${money(r.amount)}` : ""}{r.response ? ` · ${r.response}` : ""}</span>} state={<RequestState r={r} />} onClick={() => r.clientId ? nav({ name: "client", id: r.clientId }) : undefined} />)}
          {!reqs.length && <p className="cx-fold-note">Aucune demande envoyée.</p>}</div>
      </section>
    </div>
    {waiting.length > 0 && <div className="cx-actionbar cx-actionbar-total"><span><small>{chosen.length} paiement{chosen.length > 1 ? "s" : ""}</small><strong>{money(sum)}</strong></span><Button kind="primary" disabled={!chosen.length || !d.officeOnline} onClick={() => setConfirm(true)}>Valider</Button></div>}
    {confirm && <Confirm title={`Valider ${chosen.length} paiement${chosen.length > 1 ? "s" : ""} pour ${money(sum)} ?`} confirm="Valider" cancel="Pas maintenant" onClose={() => setConfirm(false)} onConfirm={() => { const n = lock(chosen.map(p => p.id), by); setConfirm(false); if (n) { toast(`${n} paiement${n > 1 ? "s validés" : " validé"}.`); setSel([]); } }}>
      <p>L’encaissement ne pourra plus les corriger ni les annuler.</p><ul className="cx-mini-list">{chosen.map(p => <li key={p.id}>{money(p.amount)}, {methodName(p.method)}, {s.invoices.find(x => x.id === p.invoiceId)?.client.name}</li>)}</ul></Confirm>}
  </div>;
}

function Settings({ by }: { by: string }) {
  const d = useData(), [add, setAdd] = useState(false), [sheet, setSheet] = useState<Account | null>(null), [reset, setReset] = useState<Account | null>(null), [toggle, setToggle] = useState<Account | null>(null), [demo, setDemo] = useState(false);
  return <div className="cx-page">
    <PageHead title="Réglages" />
    <section className="cx-section" aria-labelledby="set-team">
      <div className="cx-section-head cx-section-head-row"><div><h2 id="set-team">Équipe</h2><p>Chacun se connecte avec l’identifiant et le mot de passe que vous lui remettez.</p></div><Button icon={<UserPlus size={17} aria-hidden="true" />} onClick={() => setAdd(true)}>Ajouter une personne</Button></div>
      <div className="cx-panel cx-list">{d.accounts.map(a => <div key={a.id} className={`cx-list-row cx-static${a.active ? "" : " cx-cancelled"}`}>
        <span className="cx-list-main"><strong>{a.name}{!a.active && <span className="cx-chip">Désactivé</span>}</strong><small>{ROLE_LABEL[a.role]}. Identifiant : {a.login}</small></span>
        <span className="cx-list-actions"><button type="button" className="cx-text-btn" onClick={() => setReset(a)}><KeyRound size={15} aria-hidden="true" />Nouveau mot de passe</button>{a.id !== by && <button type="button" className="cx-text-btn" onClick={() => setToggle(a)}>{a.active ? "Désactiver" : "Réactiver"}</button>}</span>
      </div>)}</div>
    </section>
    <CompanySettings by={by} />
    <FormatSettings by={by} />
    <BackupSettings />
    <section className="cx-section" aria-labelledby="set-demo"><div className="cx-section-head"><h2 id="set-demo">Démonstration</h2><p>Ces boutons servent seulement à essayer la maquette.</p></div>
      <div className="cx-form-actions cx-left"><Button onClick={() => { setOnline(!d.officeOnline); toast(d.officeOnline ? "Coupure du bureau simulée." : "Bureau reconnecté."); }}>{d.officeOnline ? <><WifiOff size={16} aria-hidden="true" />Simuler une coupure du bureau</> : "Reconnecter le bureau"}</Button><Button kind="quiet" onClick={() => setDemo(true)}>Recharger les données d’exemple</Button></div>
    </section>
    {add && <AddMember by={by} onClose={() => setAdd(false)} onCreated={a => { setAdd(false); setSheet(a); }} />}
    {sheet && <CredentialSheet a={sheet} onClose={() => setSheet(null)} />}
    {reset && <Confirm title={`Nouveau mot de passe pour ${reset.name} ?`} confirm="Créer le mot de passe" cancel="Annuler" onClose={() => setReset(null)} onConfirm={() => { const pw = generatePassword(), at = nowIso(); commit(by, x => ({ accounts: x.accounts.map(a => a.id === reset.id ? { ...a, password: pw, passwordAt: at } : a) }), { text: `Nouveau mot de passe pour ${reset.name}` }); setSheet({ ...reset, password: pw, passwordAt: at }); setReset(null); }}><p>L’ancien mot de passe ne marchera plus. Vous remettrez le nouveau à {reset.name}.</p></Confirm>}
    {toggle && <Confirm title={toggle.active ? `Désactiver ${toggle.name} ?` : `Réactiver ${toggle.name} ?`} confirm={toggle.active ? "Désactiver" : "Réactiver"} cancel="Annuler" onClose={() => setToggle(null)} onConfirm={() => { commit(by, x => ({ accounts: x.accounts.map(a => a.id === toggle.id ? { ...a, active: !a.active } : a) }), { text: `Compte de ${toggle.name} ${toggle.active ? "désactivé" : "réactivé"}` }); setToggle(null); toast(toggle.active ? "Compte désactivé." : "Compte réactivé."); }}><p>{toggle.active ? "Cette personne ne pourra plus se connecter. Ce qu’elle a saisi reste dans l’historique." : "Cette personne pourra de nouveau se connecter."}</p></Confirm>}
    {demo && <Confirm title="Recharger les données d’exemple ?" confirm="Recharger" cancel="Garder mes essais" onClose={() => setDemo(false)} onConfirm={() => { resetDemo(); setDemo(false); toast("Données d’exemple rechargées."); }}><p>Les essais faits dans ce navigateur seront remplacés par les données de départ.</p></Confirm>}
  </div>;
}
function AddMember({ by, onClose, onCreated }: { by: string; onClose: () => void; onCreated: (a: Account) => void }) {
  const [name, setName] = useState(""), [role, setRole] = useState<Role | "">(""), [error, setError] = useState("");
  function create() {
    if (!name.trim()) return setError("Écrivez le nom de la personne."); if (!role) return setError("Choisissez ce qu’elle fera.");
    const d = getData(), a: Account = { id: uid(), name: name.trim(), role, login: generateLogin(name, d.accounts), password: generatePassword(), active: true, createdAt: nowIso(), passwordAt: nowIso() };
    commit(by, x => ({ accounts: [...x.accounts, a] }), { text: `Compte créé pour ${a.name} (${ROLE_LABEL[a.role]})` }); onCreated(a);
  }
  return <Modal side title="Ajouter une personne" subtitle="L’identifiant et le mot de passe sont créés pour vous." onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={create}>Créer son accès</Button></>}>
    <Field label="Nom et prénom" required><TextInput value={name} onChange={v => { setName(v); setError(""); }} autoFocus placeholder="Ex. Marie Ndjock…" /></Field>
    <Field label="Que fera-t-elle ?" required><Choice columns={3} value={role} onChange={v => { setRole(v); setError(""); }} options={[{ value: "facturation", label: "Facturation", sub: "Factures, avoirs, clients" }, { value: "encaissement", label: "Encaissement", sub: "Paiements" }, { value: "responsable", label: "Direction", sub: "Ce site" }]} /></Field>
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}
function CredentialSheet({ a, onClose }: { a: Account; onClose: () => void }) {
  const text = `CAPSED, accès de ${a.name}\nEspace : ${ROLE_LABEL[a.role]}\nIdentifiant : ${a.login}\nMot de passe : ${a.password}`;
  return <Modal title={`Accès de ${a.name}`} subtitle="Remettez ces informations à cette personne uniquement." onClose={onClose} actions={<><Button kind="quiet" icon={<Copy size={16} aria-hidden="true" />} onClick={() => { navigator.clipboard?.writeText(text).then(() => toast("Copié.")).catch(() => toast("Copie impossible : recopiez les informations.", "warn")); }}>Copier</Button><Button kind="primary" onClick={onClose}>C’est noté</Button></>}>
    <dl className="cx-credential"><div><dt>Espace</dt><dd>{ROLE_LABEL[a.role]}</dd></div><div><dt>Identifiant</dt><dd translate="no">{a.login}</dd></div><div><dt>Mot de passe</dt><dd translate="no">{a.password}</dd></div></dl>
    <p className="cx-muted">En cas de perte, créez un nouveau mot de passe : l’ancien ne marchera plus.</p>
  </Modal>;
}
