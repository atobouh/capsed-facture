import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCheck, ClipboardList, Copy, Download, FilePlus2, KeyRound, Lock, Phone, Send, UserPlus, Users, WifiOff } from "lucide-react";
import { exportStatementExcel } from "../account-statement";
import { Button, Choice, Confirm, DateInput, Empty, Field, Modal, MoneyInput, Notice, Paper, SearchBox, Stat, StatusChip, TextArea, TextInput, Timeline, matches, toast } from "./ui";
import { RequestState } from "./office";
import { METHODS, REQUEST_LABEL, ROLE_LABEL, accountName, accountTotals, balance, commit, dateFr, daysSince, delivery, generateLogin, generatePassword, getData, money, nowIso, resetDemo, setOnline, timeFr, todayIso, uid, useData } from "./store";
import type { Account, Client, Request, RequestKind, Role, Snapshot } from "./store";

export type RRoute = { name: "clients" | "client" | "facture" | "valider" | "reglages"; id?: string };
type Nav = (r: RRoute) => void;

export function ResponsableScreen({ route, nav, by }: { route: RRoute; nav: Nav; by: string }) {
  switch (route.name) {
    case "client": return <ClientStory id={route.id!} nav={nav} by={by} />;
    case "facture": return <InvoiceSheet id={route.id!} nav={nav} by={by} />;
    case "valider": return <Validate nav={nav} by={by} />;
    case "reglages": return <Settings by={by} />;
    default: return <Overview nav={nav} by={by} />;
  }
}
export function pendingCount(d: { snapshot: Snapshot }) { return d.snapshot.payments.filter(p => !p.lockedAt && !p.cancelledAt).length; }
const ageChip = (days: number) => days > 30 ? <span className={`cx-chip cx-tone-${days > 60 ? "bad" : "warn"}`}>{days} jours</span> : null;

/** Lock payments. Only possible while the office is connected and the payment matches what the office holds. */
function lock(ids: string[], by: string) {
  const d = getData(); if (!d.officeOnline) { toast("Reconnectez le poste du bureau pour valider.", "warn"); return 0; }
  const ok = ids.filter(id => { const k = d.snapshot.payments.find(p => p.id === id), l = d.payments.find(p => p.id === id); return k && l && !k.cancelledAt && !l.cancelledAt && !l.lockedAt && k.amount === l.amount && k.date === l.date && k.method === l.method && k.reference === l.reference; });
  if (!ok.length) { toast("Synchronisez les données avant de valider ces paiements.", "warn"); return 0; }
  const at = nowIso();
  commit(by, x => ({ payments: x.payments.map(p => ok.includes(p.id) ? { ...p, lockedAt: at } : p), events: [...ok.map(id => { const p = d.payments.find(x => x.id === id)!, i = d.invoices.find(x => x.id === p.invoiceId); return { id: uid(), at, by, text: `Paiement de ${money(p.amount)} validé et verrouillé`, clientId: i?.client.id, invoiceId: p.invoiceId }; }), ...x.events] }));
  return ok.length;
}
function send(r: Omit<Request, "id" | "createdAt" | "by">, by: string) {
  const req: Request = { ...r, id: uid(), createdAt: nowIso(), by };
  commit(by, x => ({ requests: [req, ...x.requests] }), { text: `Demande envoyée à ${ROLE_LABEL[req.to].toLowerCase()} : ${REQUEST_LABEL[req.kind].toLowerCase()}${req.amount ? ` · ${money(req.amount)}` : ""}`, clientId: req.clientId, invoiceId: req.invoiceId });
  toast(getData().officeOnline ? "Demande envoyée. Elle est arrivée sur le poste du bureau." : "Demande enregistrée. Elle arrivera sur le poste dès sa reconnexion.");
}

function Overview({ nav, by }: { nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, [q, setQ] = useState(""), [late, setLate] = useState(false), [ask, setAsk] = useState<RequestKind | null>(null);
  const rows = s.clients.filter(c => !c.archived).map(c => { const items = s.invoices.filter(i => i.client.id === c.id), a = accountTotals(items, s.payments, s.credits), open = items.filter(i => balance(i, s.payments, s.credits).due > 0); return { c, items, a, open, oldest: open.length ? Math.max(...open.map(i => daysSince(i.date))) : 0, pending: d.requests.filter(r => r.clientId === c.id && !r.resolvedAt).length }; });
  const total = rows.reduce((n, r) => n + r.a.due, 0), openCount = rows.reduce((n, r) => n + r.open.length, 0);
  const over60 = s.invoices.filter(i => balance(i, s.payments, s.credits).due > 0 && daysSince(i.date) > 60), toLock = s.payments.filter(p => !p.lockedAt && !p.cancelledAt), waiting = d.requests.filter(r => !r.resolvedAt);
  const hits = q.trim().length >= 3 ? s.invoices.filter(i => matches(q, i.number)) : [];
  const list = rows.filter(r => matches(q, r.c.name, r.c.phone, r.c.contact) && (!late || r.oldest > 60)).sort((a, b) => b.a.due - a.a.due || a.c.name.localeCompare(b.c.name));
  return <div className="cx-site-page">
    <div className="cx-site-hello"><h1 className="cx-site-title">Où en sont vos clients ?</h1><Button size="sm" kind="quiet" icon={<UserPlus size={16} />} onClick={() => setAsk("client")}>Demander un nouveau client</Button></div>
    <SearchBox value={q} onChange={setQ} placeholder="Nom d’un client ou n° de facture" />
    {!q && <>
      <div className="cx-hero"><span>Reste à recevoir · état connu</span><strong>{money(total)}</strong><small>{openCount} facture{openCount > 1 ? "s" : ""} ouverte{openCount > 1 ? "s" : ""} · {rows.length} clients actifs</small></div>
      <div className="cx-alerts">
        {!d.officeOnline && <div className="cx-alert cx-tone-bad"><WifiOff size={19} /><span>Poste du bureau hors ligne depuis {timeFr(s.receivedAt)} : des saisies peuvent manquer.</span></div>}
        {toLock.length > 0 && <button type="button" className="cx-alert cx-tone-info" onClick={() => nav({ name: "valider" })}><Lock size={19} /><span><strong>{toLock.length} paiement{toLock.length > 1 ? "s" : ""} à valider</strong> · {money(toLock.reduce((n, p) => n + p.amount, 0))}</span><ArrowRight size={17} /></button>}
        {over60.length > 0 && <button type="button" className="cx-alert cx-tone-bad" onClick={() => setLate(true)}><AlertTriangle size={19} /><span><strong>{over60.length} facture{over60.length > 1 ? "s" : ""} impayée{over60.length > 1 ? "s" : ""} depuis plus de 60 jours</strong> · {money(over60.reduce((n, i) => n + balance(i, s.payments, s.credits).due, 0))}</span><ArrowRight size={17} /></button>}
        {waiting.length > 0 && <button type="button" className="cx-alert cx-tone-warn" onClick={() => nav({ name: "valider" })}><ClipboardList size={19} /><span><strong>{waiting.length} demande{waiting.length > 1 ? "s" : ""} en cours</strong> auprès de l’équipe</span><ArrowRight size={17} /></button>}
      </div>
    </>}
    {hits.length > 0 && <><h2 className="cx-h2">Factures</h2><div className="cx-cards">{hits.map(i => { const b = balance(i, s.payments, s.credits); return <button type="button" className="cx-client-card" key={i.id} onClick={() => nav({ name: "facture", id: i.id })}><div><strong>{i.number}</strong><ArrowRight size={17} /></div><div><StatusChip status={b.status} /><strong>{money(b.due)}</strong></div><small>{i.client.name} · {dateFr(i.date)}</small></button>; })}</div></>}
    <h2 className="cx-h2">{late ? <>Clients avec une facture de plus de 60 jours <button type="button" className="cx-btn cx-btn-link cx-inline" onClick={() => setLate(false)}>Voir tous les clients</button></> : "Clients, du plus gros reste au plus petit"}</h2>
    <div className="cx-cards">{list.map(({ c, items, a, oldest, pending }) => <button type="button" className="cx-client-card" key={c.id} onClick={() => nav({ name: "client", id: c.id })}>
      <div><strong>{c.name}</strong><ArrowRight size={17} /></div>
      <div><span className={`cx-chip cx-tone-${!items.length ? "neutral" : a.refund ? "bad" : !a.due ? "good" : a.received ? "warn" : "info"}`}>{!items.length ? "Aucune facture" : a.refund ? "À restituer" : !a.due ? "Soldé" : a.received ? "Paiement partiel" : "À payer"}</span><strong>{money(a.due || a.refund)}</strong></div>
      <small>{ageChip(oldest)}{pending > 0 && <span className="cx-chip cx-tone-info">{pending} demande{pending > 1 ? "s" : ""} en cours</span>}</small>
    </button>)}{!list.length && <Empty title="Aucun client trouvé." />}</div>
    {ask && <RequestForm kind={ask} by={by} onClose={() => setAsk(null)} />}
  </div>;
}

function ClientStory({ id, nav, by }: { id: string; nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, c = s.clients.find(x => x.id === id), [ask, setAsk] = useState<{ kind: RequestKind; invoiceId?: string } | null>(null);
  if (!c) return <Empty title="Client introuvable." action={<Button onClick={() => nav({ name: "clients" })}>Tous les clients</Button>} />;
  const items = s.invoices.filter(i => i.client.id === c.id).sort((a, b) => b.date.localeCompare(a.date)), a = accountTotals(items, s.payments, s.credits);
  const pays = s.payments.filter(p => items.some(i => i.id === p.invoiceId)).sort((x, y) => y.date.localeCompare(x.date)), reqs = d.requests.filter(r => r.clientId === c.id);
  return <div className="cx-site-page">
    <button type="button" className="cx-back" onClick={() => nav({ name: "clients" })}>← Tous les clients</button>
    <h1 className="cx-site-title">{c.name}</h1>
    <p className="cx-contact">{c.contact && <span>{c.contact}</span>}{c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}><Phone size={15} /> {c.phone}</a>}</p>
    <section className="cx-balance-card"><span>Reste à recevoir · état connu</span><strong>{money(a.due)}</strong>{a.refund > 0 && <p>À restituer : {money(a.refund)}</p>}
      <div className="cx-balance-actions"><Button kind="accent" icon={<Send size={16} />} disabled={!items.length} onClick={() => setAsk({ kind: "paiement" })}>Signaler un paiement</Button><Button kind="ghost-light" icon={<FilePlus2 size={16} />} onClick={() => setAsk({ kind: "facture" })}>Demander une facture</Button></div></section>
    <div className="cx-stats cx-stats-3"><Stat label="Facturé" value={money(a.total)} /><Stat label="Reçu" value={money(a.received)} tone="good" sub={a.credited ? `avoirs : ${money(a.credited)}` : undefined} /><Stat label="Reste" value={money(a.due)} tone={a.due ? "warn" : "good"} /></div>
    <h2 className="cx-h2">Factures <span className="cx-count-soft">{items.length}</span></h2>
    <div className="cx-stack">{items.map(i => { const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id); return <details className="cx-fold" key={i.id}>
      <summary><span><strong>{i.number}</strong><small>{dateFr(i.date)} · <StatusChip status={b.status} /> {b.due > 0 && ageChip(daysSince(i.date))}</small></span><span className="cx-fold-amount"><strong>{money(b.due)}</strong><small>reste à payer</small></span></summary>
      <div className="cx-fold-body"><div className="cx-mini-stats"><div><span>Total</span><strong>{money(b.total)}</strong></div><div><span>Reçu</span><strong>{money(b.received)}</strong></div>{b.credited > 0 && <div><span>Avoirs</span><strong>{money(b.credited)}</strong></div>}</div>
        <p className={dv ? "cx-good-text" : "cx-warn-text"}>{dv ? <><Check size={14} /> Remise déclarée par l’équipe le {dateFr(dv.declaredAt)}</> : "Remise au client non confirmée"}</p>
        <div className="cx-card-actions cx-left">{b.due > 0 && <Button size="sm" icon={<Send size={14} />} onClick={() => setAsk({ kind: "paiement", invoiceId: i.id })}>Signaler un paiement</Button>}<Button size="sm" kind="quiet" onClick={() => nav({ name: "facture", id: i.id })}>Voir le détail</Button></div></div>
    </details>; })}{!items.length && <Empty title="Aucune facture connue." />}</div>
    <h2 className="cx-h2">Paiements <span className="cx-count-soft">{pays.length}</span></h2>
    <div className="cx-stack">{pays.map(p => <PaymentCard key={p.id} p={p} by={by} />)}{!pays.length && <p className="cx-muted">Aucun versement distinct. Les avances figurent sur les factures.</p>}</div>
    {reqs.length > 0 && <><h2 className="cx-h2">Demandes <span className="cx-count-soft">{reqs.length}</span></h2><div className="cx-stack">{reqs.map(r => <RequestCard key={r.id} r={r} />)}</div></>}
    <h2 className="cx-h2">Tout ce qui s’est passé</h2>
    <Timeline events={d.events.filter(e => e.clientId === id).slice(0, 25)} />
    <div className="cx-actions-center"><Button icon={<Download size={17} />} onClick={() => exportStatementExcel(s.clients, s.invoices, s.payments, s.credits, c.id, { from: (items.at(-1)?.date ?? todayIso()).slice(0, 4) + "-01-01", to: todayIso() })}>Télécharger la situation (Excel)</Button></div>
    {ask && <RequestForm kind={ask.kind} client={c} invoiceId={ask.invoiceId} by={by} onClose={() => setAsk(null)} />}
  </div>;
}
function PaymentCard({ p, by }: { p: Snapshot["payments"][number]; by: string }) {
  const d = useData(), i = d.snapshot.invoices.find(x => x.id === p.invoiceId);
  return <div className={`cx-pay-card${p.cancelledAt ? " cx-cancelled" : ""}`}><div><strong>{money(p.amount)}</strong><span>{p.method} · {dateFr(p.date)} · {i?.number}</span>{p.reference && <small>{p.reference}</small>}<small>saisi par {accountName(p.by)}</small></div>
    {p.cancelledAt ? <span className="cx-chip cx-tone-bad">Annulé</span> : p.lockedAt ? <span className="cx-chip cx-tone-good"><Lock size={12} /> Validé</span> : <Button size="sm" icon={<Lock size={14} />} disabled={!d.officeOnline} title={!d.officeOnline ? "Reconnectez le poste pour valider" : "Valider et verrouiller ce paiement"} onClick={() => { if (lock([p.id], by)) toast("Paiement validé et verrouillé."); }}>Valider</Button>}</div>;
}
function RequestCard({ r }: { r: Request }) {
  return <details className="cx-fold"><summary><span><strong>{REQUEST_LABEL[r.kind]}{r.amount ? ` · ${money(r.amount)}` : ""}</strong><small>{r.invoiceNumber ?? r.clientName} · envoyée {timeFr(r.createdAt)}</small></span><RequestState r={r} /></summary>
    <div className="cx-fold-body">{r.kind === "paiement" && <p>{r.method} · payé le {r.paymentDate ? dateFr(r.paymentDate) : "—"}{r.reference ? ` · réf. ${r.reference}` : ""}</p>}{r.message && <p>« {r.message} »</p>}{r.response ? <p className="cx-answer"><strong>Réponse de {accountName(r.resolvedBy)} :</strong> {r.response}</p> : <p className="cx-muted">Pas encore de réponse.</p>}</div></details>;
}

/** Manager → team: payment to check, invoice to create, client to create. */
function RequestForm({ kind, client, invoiceId, by, onClose }: { kind: RequestKind; client?: Client; invoiceId?: string; by: string; onClose: () => void }) {
  const d = getData(), s = d.snapshot, items = client ? s.invoices.filter(i => i.client.id === client.id) : [];
  const [inv, setInv] = useState(invoiceId ?? items.find(i => balance(i, s.payments, s.credits).due > 0)?.id ?? items[0]?.id ?? ""), [amount, setAmount] = useState(0), [date, setDate] = useState(todayIso()), [method, setMethod] = useState(METHODS[0]), [reference, setReference] = useState(""), [message, setMessage] = useState("");
  const [nc, setNc] = useState<Partial<Client>>({ name: "", contact: "", phone: "", address: "" }), [error, setError] = useState("");
  function submit() {
    if (kind === "paiement") { const i = items.find(x => x.id === inv); if (!i) return setError("Choisissez une facture."); if (!amount) return setError("Indiquez le montant signalé."); if (!date) return setError("Indiquez la date du paiement.");
      send({ kind, to: "encaissement", clientId: client!.id, clientName: client!.name, invoiceId: i.id, invoiceNumber: i.number, amount, paymentDate: date, method, reference: reference.trim(), message: message.trim() }, by); }
    else if (kind === "facture") { if (!message.trim()) return setError("Décrivez ce qu’il faut facturer."); send({ kind, to: "facturation", clientId: client!.id, clientName: client!.name, amount: amount || undefined, message: message.trim() }, by); }
    else { if (!nc.name?.trim()) return setError("Indiquez le nom du client."); send({ kind, to: "facturation", clientName: nc.name.trim(), newClient: { ...nc, name: nc.name.trim() }, message: message.trim() }, by); }
    onClose();
  }
  const title = kind === "paiement" ? "Signaler un paiement" : kind === "facture" ? "Demander une facture" : "Demander un nouveau client";
  const sub = kind === "paiement" ? `${client?.name} · l’encaissement vérifie avant d’enregistrer` : kind === "facture" ? `${client?.name} · la facturation crée la facture` : "La facturation crée la fiche du client";
  return <Modal title={title} subtitle={sub} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" icon={<Send size={15} />} onClick={submit}>Envoyer la demande</Button></>}>
    {kind === "paiement" && <>
      <Field label="Facture" required><Choice columns={2} value={inv} onChange={setInv} options={items.map(i => ({ value: i.id, label: i.number, sub: `reste ${money(balance(i, s.payments, s.credits).due)}` }))} /></Field>
      <div className="cx-form-grid"><Field label="Montant reçu" required><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field><Field label="Date du paiement" required><DateInput value={date} max={todayIso()} onChange={setDate} /></Field></div>
      <Field label="Mode de paiement" required><Choice columns={5} value={method} onChange={setMethod} options={METHODS.map(m => ({ value: m, label: m }))} /></Field>
      <div className="cx-form-grid"><Field label="Référence" optional><TextInput value={reference} onChange={setReference} /></Field><Field label="Message" optional><TextInput value={message} onChange={setMessage} placeholder="Ex. viré lundi" /></Field></div>
      <p className="cx-hint">Ceci ne crée pas de paiement : l’équipe vérifie la demande avant d’enregistrer.</p>
    </>}
    {kind === "facture" && <>
      <Field label="Que faut-il facturer ?" required hint="Prestations, quantités, destination, bon de commande…"><TextArea rows={4} value={message} onChange={setMessage} placeholder="Ex. Traitement phytosanitaire de 3 conteneurs pour Kolkata, BC-2026-021" /></Field>
      <Field label="Montant indicatif" optional><MoneyInput value={amount} onChange={setAmount} /></Field>
    </>}
    {kind === "client" && <div className="cx-form-grid">
      <Field label="Nom du client" required wide><TextInput value={nc.name ?? ""} onChange={v => setNc({ ...nc, name: v })} autoFocus /></Field>
      <Field label="Personne à contacter" optional><TextInput value={nc.contact ?? ""} onChange={v => setNc({ ...nc, contact: v })} /></Field>
      <Field label="Téléphone" optional><TextInput value={nc.phone ?? ""} onChange={v => setNc({ ...nc, phone: v })} /></Field>
      <Field label="Adresse" optional wide><TextInput value={nc.address ?? ""} onChange={v => setNc({ ...nc, address: v })} /></Field>
      <Field label="Message" optional wide><TextArea rows={2} value={message} onChange={setMessage} placeholder="Ex. nouveau client, première facture la semaine prochaine" /></Field>
    </div>}
    {!d.officeOnline && <Notice tone="warn">Le poste du bureau est hors ligne : la demande partira à sa reconnexion.</Notice>}
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}

function InvoiceSheet({ id, nav, by }: { id: string; nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, i = s.invoices.find(x => x.id === id), [ask, setAsk] = useState(false);
  if (!i) return <Empty title="Facture introuvable." />;
  const b = balance(i, s.payments, s.credits), dv = delivery(s, i.id), client = s.clients.find(c => c.id === i.client.id) ?? i.client;
  return <div className="cx-site-page">
    <button type="button" className="cx-back" onClick={() => nav({ name: "client", id: i.client.id })}>← {i.client.name}</button>
    <h1 className="cx-site-title">Facture {i.number} <StatusChip status={b.status} /></h1>
    <p className="cx-muted">Émise le {dateFr(i.date)} · il y a {daysSince(i.date)} jours{i.revisedAt ? ` · modifiée le ${dateFr(i.revisedAt)}` : ""}</p>
    <div className="cx-stats cx-stats-3"><Stat label="Montant" value={money(b.total)} /><Stat label="Reçu" value={money(b.received)} tone="good" sub={b.credited ? `avoirs : ${money(b.credited)}` : undefined} /><Stat label="Reste" value={money(b.due)} tone={b.due ? "warn" : "good"} /></div>
    <section className="cx-card"><h3 className="cx-card-title">Le client l’a-t-il reçue ?</h3>{dv ? <p className="cx-good-text"><Check size={15} /> Remise déclarée par {accountName(dv.by)} le {dateFr(dv.declaredAt)}.</p> : <p className="cx-warn-text">Remise au client non confirmée.</p>}</section>
    <section className="cx-card"><h3 className="cx-card-title">Paiements</h3><div className="cx-stack">{s.payments.filter(p => p.invoiceId === i.id).map(p => <PaymentCard key={p.id} p={p} by={by} />)}</div>{!s.payments.some(p => p.invoiceId === i.id) && <p className="cx-muted">Aucun paiement enregistré{i.advance ? ` (avance de ${money(i.advance)} à l’émission)` : ""}.</p>}
      {b.due > 0 && <div className="cx-card-actions"><Button kind="primary" icon={<Send size={15} />} onClick={() => setAsk(true)}>Signaler un paiement</Button></div>}</section>
    <h2 className="cx-h2">Historique</h2><Timeline events={d.events.filter(e => e.invoiceId === i.id)} />
    <details className="cx-details-more"><summary>Voir la facture telle qu’imprimée</summary><Paper invoice={i} /></details>
    {ask && <RequestForm kind="paiement" client={client as Client} invoiceId={i.id} by={by} onClose={() => setAsk(false)} />}
  </div>;
}

function Validate({ nav, by }: { nav: Nav; by: string }) {
  const d = useData(), s = d.snapshot, waiting = s.payments.filter(p => !p.lockedAt && !p.cancelledAt).sort((a, b) => a.date.localeCompare(b.date));
  const [sel, setSel] = useState<string[]>(() => waiting.map(p => p.id)), [confirm, setConfirm] = useState(false);
  const chosen = waiting.filter(p => sel.includes(p.id)), sum = chosen.reduce((n, p) => n + p.amount, 0), reqs = [...d.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="cx-site-page">
    <h1 className="cx-site-title">À valider</h1>
    <p className="cx-muted">Un paiement validé est verrouillé : l’équipe ne peut plus le modifier ni l’annuler.</p>
    {!d.officeOnline && <Notice tone="warn" title="Poste du bureau hors ligne">La validation reprendra dès sa reconnexion.</Notice>}
    <h2 className="cx-h2">Paiements saisis par l’équipe <span className="cx-count-soft">{waiting.length}</span></h2>
    {waiting.length ? <>
      <label className="cx-select-all"><input type="checkbox" checked={chosen.length === waiting.length} onChange={e => setSel(e.target.checked ? waiting.map(p => p.id) : [])} /> Tout sélectionner</label>
      <div className="cx-stack">{waiting.map(p => { const i = s.invoices.find(x => x.id === p.invoiceId); return <label key={p.id} className={`cx-check-card${sel.includes(p.id) ? " cx-on" : ""}`}><input type="checkbox" checked={sel.includes(p.id)} onChange={e => setSel(v => e.target.checked ? [...v, p.id] : v.filter(x => x !== p.id))} />
        <span><strong>{money(p.amount)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</strong><small>{i?.client.name} · {i?.number} · payé le {dateFr(p.date)} · saisi par {accountName(p.by)}{p.history?.length ? ` · corrigé ${p.history.length}×` : ""}</small></span></label>; })}</div>
      <div className="cx-sticky-action"><Button kind="primary" wide disabled={!chosen.length || !d.officeOnline} icon={<CheckCheck size={19} />} onClick={() => setConfirm(true)}>{chosen.length ? `Valider ${chosen.length} paiement${chosen.length > 1 ? "s" : ""} · ${money(sum)}` : "Cochez les paiements à valider"}</Button></div>
    </> : <Empty icon={<Check size={24} />} title="Aucun paiement à valider." />}
    <h2 className="cx-h2">Vos demandes à l’équipe <span className="cx-count-soft">{reqs.length}</span></h2>
    <div className="cx-stack">{reqs.map(r => <div key={r.id} onClick={() => r.clientId && nav({ name: "client", id: r.clientId })}><RequestCard r={r} /></div>)}{!reqs.length && <p className="cx-muted">Aucune demande envoyée.</p>}</div>
    {confirm && <Confirm title={`Valider ${chosen.length} paiement${chosen.length > 1 ? "s" : ""} ?`} confirm={`Valider et verrouiller · ${money(sum)}`} cancel="Pas maintenant" onClose={() => setConfirm(false)} onConfirm={() => { const n = lock(chosen.map(p => p.id), by); setConfirm(false); if (n) { toast(`${n} paiement${n > 1 ? "s validés" : " validé"} et verrouillé${n > 1 ? "s" : ""}.`); setSel([]); } }}>
      <p>Une fois validés, ces paiements ne pourront plus être modifiés ni annulés par l’équipe.</p><ul className="cx-mini-list">{chosen.map(p => <li key={p.id}>{money(p.amount)} · {p.method} · {s.invoices.find(x => x.id === p.invoiceId)?.client.name}</li>)}</ul></Confirm>}
  </div>;
}

function Settings({ by }: { by: string }) {
  const d = useData(), [add, setAdd] = useState(false), [sheet, setSheet] = useState<Account | null>(null), [reset, setReset] = useState<Account | null>(null), [toggle, setToggle] = useState<Account | null>(null), [demo, setDemo] = useState(false), [show, setShow] = useState<Record<string, boolean>>({});
  return <div className="cx-site-page">
    <h1 className="cx-site-title">Réglages</h1>
    <section className="cx-card"><div className="cx-card-head-inline"><h3 className="cx-card-title"><Users size={17} /> Équipe et accès</h3><Button size="sm" kind="primary" icon={<UserPlus size={15} />} onClick={() => setAdd(true)}>Ajouter un membre</Button></div>
      <p className="cx-muted">Chaque personne reçoit un identifiant et un mot de passe générés. Remettez-les en main propre ; en cas d’oubli, générez-en un nouveau. Un compte n’est jamais supprimé : il est désactivé.</p>
      <div className="cx-team">{d.accounts.map(a => <div key={a.id} className={`cx-member${a.active ? "" : " cx-inactive"}`}>
        <span className="cx-monogram">{a.name.slice(0, 2).toUpperCase()}</span>
        <div className="cx-member-main"><strong>{a.name} {!a.active && <span className="cx-chip cx-tone-neutral">Désactivé</span>}</strong><small><span className={`cx-role-dot cx-dot-${a.role}`} />{ROLE_LABEL[a.role]} · identifiant <code>{a.login}</code> · mot de passe <code>{show[a.id] ? a.password : "••••••••"}</code> <button type="button" className="cx-btn cx-btn-link cx-inline" onClick={() => setShow(v => ({ ...v, [a.id]: !v[a.id] }))}>{show[a.id] ? "masquer" : "afficher"}</button></small><small>Mot de passe créé le {dateFr(a.passwordAt)}</small></div>
        <div className="cx-member-actions"><Button size="sm" kind="quiet" icon={<KeyRound size={14} />} onClick={() => setReset(a)}>Nouveau mot de passe</Button>{a.id !== by && <Button size="sm" kind="quiet" onClick={() => setToggle(a)}>{a.active ? "Désactiver" : "Réactiver"}</Button>}</div>
      </div>)}</div>
      <p className="cx-hint">Démonstration : les comptes restent dans ce navigateur. Avec le serveur, seuls des mots de passe chiffrés seront conservés.</p>
    </section>
    <section className="cx-card"><h3 className="cx-card-title"><WifiOff size={17} /> Connexion du poste du bureau</h3>
      <p>{d.officeOnline ? <span className="cx-good-text"><Check size={15} /> Connecté · état reçu {timeFr(d.snapshot.receivedAt)}</span> : <span className="cx-warn-text">Hors ligne depuis {timeFr(d.snapshot.receivedAt)}</span>}</p>
      <p className="cx-muted">Simulation : pendant une coupure, vous voyez le dernier état reçu et les demandes attendent la reconnexion.</p>
      <div className="cx-card-actions cx-left"><Button onClick={() => { setOnline(!d.officeOnline); toast(d.officeOnline ? "Coupure simulée." : "Poste reconnecté : données et demandes synchronisées."); }}>{d.officeOnline ? "Simuler une coupure" : "Simuler la reconnexion"}</Button></div>
    </section>
    <section className="cx-card"><h3 className="cx-card-title">Démonstration</h3><div className="cx-card-actions cx-left"><Button kind="quiet" onClick={() => setDemo(true)}>Recharger les données d’exemple</Button><a className="cx-btn cx-btn-link" href="#ancien">Ouvrir le premier prototype</a></div></section>
    {add && <AddMember by={by} onClose={() => setAdd(false)} onCreated={a => { setAdd(false); setSheet(a); }} />}
    {sheet && <CredentialSheet a={sheet} onClose={() => setSheet(null)} />}
    {reset && <Confirm title={`Nouveau mot de passe pour ${reset.name} ?`} confirm="Générer le mot de passe" cancel="Annuler" onClose={() => setReset(null)} onConfirm={() => { const pw = generatePassword(), at = nowIso(); commit(by, x => ({ accounts: x.accounts.map(a => a.id === reset.id ? { ...a, password: pw, passwordAt: at } : a) }), { text: `Nouveau mot de passe généré pour ${reset.name}` }); setSheet({ ...reset, password: pw, passwordAt: at }); setReset(null); }}><p>L’ancien mot de passe ne fonctionnera plus. Vous remettrez le nouveau à {reset.name}.</p></Confirm>}
    {toggle && <Confirm title={toggle.active ? `Désactiver ${toggle.name} ?` : `Réactiver ${toggle.name} ?`} confirm={toggle.active ? "Désactiver le compte" : "Réactiver le compte"} cancel="Annuler" onClose={() => setToggle(null)} onConfirm={() => { commit(by, x => ({ accounts: x.accounts.map(a => a.id === toggle.id ? { ...a, active: !a.active } : a) }), { text: `Compte de ${toggle.name} ${toggle.active ? "désactivé" : "réactivé"}` }); setToggle(null); toast(toggle.active ? "Compte désactivé. Son historique est conservé." : "Compte réactivé."); }}><p>{toggle.active ? "Cette personne ne pourra plus se connecter. Tout ce qu’elle a saisi reste dans l’historique." : "Cette personne pourra de nouveau se connecter avec son mot de passe actuel."}</p></Confirm>}
    {demo && <Confirm title="Recharger les données d’exemple ?" confirm="Recharger les exemples" cancel="Garder mes essais" onClose={() => setDemo(false)} onConfirm={() => { resetDemo(); setDemo(false); toast("Données d’exemple rechargées."); }}><p>Les essais faits dans ce navigateur seront remplacés par les données fictives de départ.</p></Confirm>}
  </div>;
}
function AddMember({ by, onClose, onCreated }: { by: string; onClose: () => void; onCreated: (a: Account) => void }) {
  const [name, setName] = useState(""), [role, setRole] = useState<Role | "">(""), [error, setError] = useState("");
  function create() {
    if (!name.trim()) return setError("Indiquez le nom de la personne."); if (!role) return setError("Choisissez son espace.");
    const d = getData(), a: Account = { id: uid(), name: name.trim(), role, login: generateLogin(name, d.accounts), password: generatePassword(), active: true, createdAt: nowIso(), passwordAt: nowIso() };
    commit(by, x => ({ accounts: [...x.accounts, a] }), { text: `Compte créé pour ${a.name} (${ROLE_LABEL[a.role]})` }); onCreated(a);
  }
  return <Modal title="Ajouter un membre de l’équipe" subtitle="L’identifiant et le mot de passe sont générés automatiquement." onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" icon={<KeyRound size={15} />} onClick={create}>Créer le compte</Button></>}>
    <Field label="Nom et prénom" required><TextInput value={name} onChange={v => { setName(v); setError(""); }} autoFocus placeholder="Ex. Marie Ndjock" /></Field>
    <Field label="Espace" required><Choice columns={3} value={role} onChange={v => { setRole(v); setError(""); }} options={[{ value: "facturation", label: "Facturation", sub: "Factures, avoirs, clients" }, { value: "encaissement", label: "Encaissement", sub: "Paiements, situations" }, { value: "responsable", label: "Responsable", sub: "Site de contrôle" }]} /></Field>
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}
function CredentialSheet({ a, onClose }: { a: Account; onClose: () => void }) {
  const text = `CAPSED · accès de ${a.name}\nEspace : ${ROLE_LABEL[a.role]}\nIdentifiant : ${a.login}\nMot de passe : ${a.password}`;
  return <Modal title="Fiche d’accès à remettre" subtitle={a.name} onClose={onClose} actions={<><Button kind="quiet" icon={<Copy size={15} />} onClick={() => { navigator.clipboard?.writeText(text).then(() => toast("Fiche copiée.")).catch(() => toast("Copie impossible : notez les informations.", "warn")); }}>Copier</Button><Button kind="primary" onClick={onClose}>C’est noté</Button></>}>
    <div className="cx-credential"><img src="capsed-logo.png" alt="" /><div><p><span>Espace</span><strong>{ROLE_LABEL[a.role]}</strong></p><p><span>Identifiant</span><strong><code>{a.login}</code></strong></p><p><span>Mot de passe</span><strong><code>{a.password}</code></strong></p></div></div>
    <Notice tone="warn">Remettez cette fiche uniquement à {a.name}. En cas de perte, générez un nouveau mot de passe.</Notice>
  </Modal>;
}
