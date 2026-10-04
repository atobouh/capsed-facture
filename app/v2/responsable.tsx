import { useState } from "react";
import { AlertTriangle, CheckCheck, ClipboardCheck, Download, Lock, Phone, WifiOff } from "lucide-react";
import { downloadExcel } from "../receipt-export";
import { Button, Choice, Empty, Field, InvoicePaper, Modal, MoneyInput, Notice, SearchBox, Stat, StatusChip, TextInput, Timeline, matches, toast } from "./ui";
import { PaymentLine, RequestCard, Row } from "./shared";
import { METHODS, REQUEST_LABEL, applyApproved, clientSummary, commit, dateFr, daysSince, invoiceBalance, invoiceStatus, liveInvoices, money, nowIso, resetDemo, hoursSince, todayIso, uid, useData, userName } from "./store";
import type { Client, Data, Invoice, Request } from "./store";

export type RRoute = { name: "clients" | "client" | "facture" | "valider" | "reglages"; id?: string };
type Nav = (r: RRoute) => void;
const ME = "u-dir";

export function ResponsableScreen({ route, nav }: { route: RRoute; nav: Nav }) {
  switch (route.name) {
    case "client": return <ClientStory id={route.id!} nav={nav} />;
    case "facture": return <InvoiceSheet id={route.id!} nav={nav} />;
    case "valider": return <ApprovalQueue nav={nav} />;
    case "reglages": return <Settings />;
    default: return <Overview nav={nav} />;
  }
}
export function pendingCount(d: Data) { return d.payments.filter(p => !p.validated && !p.reversed).length + d.requests.filter(r => r.kind !== "verification" && r.status === "envoyee").length; }

function ageChip(days: number) { return days > 30 ? <span className={`cx-chip cx-tone-${days > 60 ? "bad" : "warn"}`}>{days} jours</span> : null; }

function Overview({ nav }: { nav: Nav }) {
  const d = useData(), [q, setQ] = useState(""), [late, setLate] = useState(false);
  const rows = d.clients.filter(c => !c.archivedAt).map(c => ({ c, s: clientSummary(c, d) }));
  const totalDue = rows.reduce((s, r) => s + r.s.due, 0), openCount = rows.reduce((s, r) => s + r.s.open.length, 0);
  const over60 = liveInvoices(d).filter(i => i.status === "emise" && invoiceBalance(i, d).due > 0 && daysSince(i.date) > 60);
  const over30 = liveInvoices(d).filter(i => i.status === "emise" && invoiceBalance(i, d).due > 0 && daysSince(i.date) > 30);
  const toValidate = d.payments.filter(p => !p.validated && !p.reversed), corrections = d.requests.filter(r => r.kind !== "verification" && r.status === "envoyee");
  const silent = hoursSince(d.officeSyncAt) > 24 || d.officeOffline;
  const invoiceHits = q.trim().length >= 3 ? liveInvoices(d).filter(i => matches(q, i.number)) : [];
  const list = rows.filter(r => matches(q, r.c.name, r.c.contact, r.c.phone) && (!late || r.s.oldest > 30)).sort((a, b) => b.s.due - a.s.due || a.c.name.localeCompare(b.c.name));
  return <div className="cx-site-page">
    <h1 className="cx-site-title">Où en sont vos clients ?</h1>
    <SearchBox value={q} onChange={setQ} placeholder="Nom d’un client ou n° de facture" />
    {!q && <>
      <div className="cx-hero"><span>Reste à recevoir</span><strong>{money(totalDue)}</strong><small>{openCount} facture{openCount > 1 ? "s" : ""} ouverte{openCount > 1 ? "s" : ""}{over30.length > 0 && <> · dont {over30.length} en retard de plus de 30 jours</>}</small></div>
      <div className="cx-alerts">
        {silent && <div className="cx-alert cx-tone-bad"><WifiOff size={20} /><span>Le poste du bureau n’a pas communiqué depuis {dateFr(d.officeSyncAt)}. Des saisies peuvent manquer.</span></div>}
        {toValidate.length > 0 && <button type="button" className="cx-alert cx-tone-info" onClick={() => nav({ name: "valider" })}><Lock size={20} /><span><strong>{toValidate.length} paiement{toValidate.length > 1 ? "s" : ""} à valider</strong> · {money(toValidate.reduce((s, p) => s + p.amount, 0))}</span></button>}
        {corrections.length > 0 && <button type="button" className="cx-alert cx-tone-warn" onClick={() => nav({ name: "valider" })}><ClipboardCheck size={20} /><span><strong>{corrections.length} demande{corrections.length > 1 ? "s" : ""} de correction</strong> à décider</span></button>}
        {over60.length > 0 && <button type="button" className="cx-alert cx-tone-bad" onClick={() => setLate(true)}><AlertTriangle size={20} /><span><strong>{over60.length} facture{over60.length > 1 ? "s" : ""} impayée{over60.length > 1 ? "s" : ""} depuis plus de 60 jours</strong> · {money(over60.reduce((s, i) => s + invoiceBalance(i, d).due, 0))}</span></button>}
      </div>
    </>}
    {invoiceHits.length > 0 && <><h2 className="cx-h2">Factures</h2><div className="cx-list">{invoiceHits.map(i => <Row key={i.id} onClick={() => nav({ name: "facture", id: i.id })} aside={<strong className="cx-amount">{money(invoiceBalance(i, d).due)}</strong>}><strong>{i.number} · {i.client.name}</strong><span className="cx-row-sub"><StatusChip status={invoiceStatus(i, d)} /> {dateFr(i.date)}</span></Row>)}</div></>}
    <h2 className="cx-h2">{late ? <>Clients en retard <button type="button" className="cx-btn cx-btn-link cx-inline" onClick={() => setLate(false)}>Voir tous les clients</button></> : "Clients, du plus gros reste au plus petit"}</h2>
    <div className="cx-list">{list.map(({ c, s }) => <Row key={c.id} onClick={() => nav({ name: "client", id: c.id })} aside={s.due ? <><strong className="cx-amount">{money(s.due)}</strong>{ageChip(s.oldest)}</> : <span className="cx-chip cx-tone-good">À jour</span>}>
      <strong>{c.name}</strong><span className="cx-row-sub">{s.open.length ? `${s.open.length} facture${s.open.length > 1 ? "s" : ""} ouverte${s.open.length > 1 ? "s" : ""}` : "Rien à recevoir"}{s.lastActivity && <> · dernière activité {dateFr(s.lastActivity)}</>}</span>
    </Row>)}{!list.length && <Empty title="Aucun client ne correspond." />}</div>
  </div>;
}

function statement(c: Client, d: Data) {
  const inv = liveInvoices(d).filter(i => i.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  const rows: (string | number)[][] = [["Relevé du client", c.name], ["Édité le", dateFr(todayIso())], [], ["Date", "Opération", "Facture", "Débit (FCFA)", "Crédit (FCFA)"]];
  inv.forEach(i => {
    rows.push([dateFr(i.date), i.status === "annulee" ? "Facture annulée" : "Facture", i.number!, i.status === "annulee" ? 0 : invoiceBalance(i, d).total, 0]);
    d.payments.filter(p => p.invoiceId === i.id && !p.reversed).forEach(p => rows.push([dateFr(p.date), `Paiement ${p.method}${p.reference ? " " + p.reference : ""}`, i.number!, 0, p.amount]));
    d.credits.filter(x => x.invoiceId === i.id).forEach(x => rows.push([dateFr(x.at), `Avoir ${x.number}`, i.number!, 0, x.amount]));
  });
  const s = clientSummary(c, d); rows.push([], ["", "Reste à recevoir", "", s.due, ""]);
  downloadExcel(rows, `releve-${c.name.replace(/\W+/g, "-").toLowerCase()}-${todayIso()}.xlsx`);
}

function ClientStory({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), c = d.clients.find(x => x.id === id);
  if (!c) return <Empty title="Client introuvable." />;
  const s = clientSummary(c, d), paid = liveInvoices(d).filter(i => i.clientId === id && !s.open.includes(i)).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="cx-site-page">
    <button type="button" className="cx-back" onClick={() => nav({ name: "clients" })}>← Tous les clients</button>
    <h1 className="cx-site-title">{c.name}</h1>
    <p className="cx-contact">{c.contact && <span>{c.contact}</span>}{c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}><Phone size={16} /> {c.phone}</a>}</p>
    <div className="cx-stats cx-stats-3"><Stat label="Facturé" value={money(s.billed)} /><Stat label="Reçu" value={money(s.received)} tone="good" sub={s.credited ? `+ avoirs ${money(s.credited)}` : undefined} /><Stat label="Reste" value={money(s.due)} tone={s.due ? "warn" : "good"} /></div>
    <h2 className="cx-h2">Factures ouvertes</h2>
    <div className="cx-list">{s.open.length ? s.open.sort((a, b) => a.date.localeCompare(b.date)).map(i => { const b = invoiceBalance(i, d), age = daysSince(i.date); return <Row key={i.id} onClick={() => nav({ name: "facture", id: i.id })} aside={<><strong className="cx-amount">{money(b.due)}</strong>{ageChip(age)}</>}>
      <strong>{i.number}</strong><span className="cx-row-sub">{dateFr(i.date)} · {i.delivery ? <>remise le {dateFr(i.delivery.date)}</> : <span className="cx-chip cx-tone-warn">pas encore remise</span>}{b.received > 0 && <> · déjà reçu {money(b.received)}</>}</span></Row>; }) : <Empty title="Rien à recevoir de ce client." />}</div>
    <h2 className="cx-h2">Tout ce qui s’est passé</h2>
    <Timeline events={d.events.filter(e => e.clientId === id)} />
    {paid.length > 0 && <details className="cx-details-more"><summary>Factures réglées ou annulées ({paid.length})</summary><div className="cx-list">{paid.map(i => <Row key={i.id} onClick={() => nav({ name: "facture", id: i.id })} aside={<strong className="cx-amount">{money(invoiceBalance(i, d).total)}</strong>}><strong>{i.number}</strong><span className="cx-row-sub"><StatusChip status={invoiceStatus(i, d)} /> {dateFr(i.date)}</span></Row>)}</div></details>}
    <div className="cx-actions-center"><Button icon={<Download size={18} />} onClick={() => statement(c, d)}>Télécharger le relevé (Excel)</Button></div>
  </div>;
}

function InvoiceSheet({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), i = d.invoices.find(x => x.id === id), [check, setCheck] = useState(false);
  if (!i) return <Empty title="Facture introuvable." />;
  const b = invoiceBalance(i, d), checks = d.requests.filter(r => r.kind === "verification" && r.invoiceId === i.id);
  return <div className="cx-site-page">
    <button type="button" className="cx-back" onClick={() => nav({ name: "client", id: i.clientId })}>← {i.client.name}</button>
    <h1 className="cx-site-title">Facture {i.number} <StatusChip status={invoiceStatus(i, d)} /></h1>
    <p className="cx-muted">Émise le {dateFr(i.date)} par {userName(i.createdBy)} · il y a {daysSince(i.date)} jours</p>
    <div className="cx-stats cx-stats-3"><Stat label="Montant" value={money(b.total)} /><Stat label="Reçu" value={money(b.received)} tone="good" /><Stat label="Reste" value={money(b.due)} tone={b.due ? "warn" : "good"} /></div>
    <section className="cx-card"><h3>Le client l’a-t-il reçue ?</h3>{i.delivery ? <p>Oui, déclarée remise le <strong>{dateFr(i.delivery.date)}</strong> ({i.delivery.how.toLowerCase()}), reçue par {i.delivery.receivedBy}. Déclaré par {userName(i.delivery.by)}.</p> : <p><span className="cx-chip cx-tone-warn">Pas encore remise</span> L’équipe ne l’a pas encore déclarée remise.</p>}</section>
    <section className="cx-card"><h3>Paiements</h3>{b.due > 0 && i.status === "emise" && <p className="cx-muted">Le client dit avoir payé ? Demandez à l’encaissement de vérifier.</p>}{d.payments.some(p => p.invoiceId === i.id) ? <div className="cx-list cx-list-tight">{d.payments.filter(p => p.invoiceId === i.id).map(p => <PaymentLine key={p.id} p={p} d={d} />)}</div> : <p className="cx-muted">Aucun paiement enregistré.</p>}
      {d.credits.filter(c => c.invoiceId === i.id).map(c => <p key={c.id}>Avoir {c.number} : − {money(c.amount)} ({c.reason})</p>)}
      {b.due > 0 && i.status === "emise" && <div className="cx-card-actions"><Button kind="primary" onClick={() => setCheck(true)}>Vérifier un paiement signalé</Button></div>}</section>
    {checks.length > 0 && <section><h2 className="cx-h2">Vérifications demandées</h2><div className="cx-stack">{checks.map(r => <RequestCard key={r.id} r={r} d={d} />)}</div></section>}
    <h2 className="cx-h2">Historique</h2><Timeline events={d.events.filter(e => e.invoiceId === i.id)} />
    <details className="cx-details-more"><summary>Voir la facture telle qu’imprimée</summary><InvoicePaper invoice={i} /></details>
    {check && <CheckForm invoice={i} onClose={() => setCheck(false)} />}
  </div>;
}

function CheckForm({ invoice: i, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [amount, setAmount] = useState(0), [date, setDate] = useState(todayIso()), [method, setMethod] = useState(""), [reference, setReference] = useState(""), [note, setNote] = useState(""), [tried, setTried] = useState(false);
  const err = { amount: !amount ? "Indiquez le montant signalé." : "", method: !method ? "Choisissez le mode." : "" };
  function send() {
    setTried(true); if (err.amount || err.method) return;
    const r: Request = { id: uid(), kind: "verification", status: "envoyee", clientId: i.clientId, invoiceId: i.id, amount, paymentDate: date, method, reference: reference.trim(), reason: "", note: note.trim(), by: ME, at: nowIso() };
    commit(ME, d => ({ requests: [r, ...d.requests] }), { text: `Vérification demandée : ${money(amount)} par ${method} sur ${i.number}`, clientId: i.clientId, invoiceId: i.id });
    toast("Demande envoyée à l’encaissement. Elle arrivera sur le poste à la prochaine connexion."); onClose();
  }
  return <Modal title={`Vérifier un paiement · ${i.number}`} onClose={onClose} actions={<><Button kind="link" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={send}>Envoyer la demande</Button></>}>
    <Notice>Ceci n’enregistre pas de paiement. L’équipe vérifie, puis l’enregistre ou vous répond.</Notice>
    <Field label="Montant signalé" required error={tried ? err.amount : ""}><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
    <Field label="Mode" required error={tried ? err.method : ""}><Choice columns={3} value={method} onChange={setMethod} options={METHODS.map(m => ({ value: m, label: m }))} /></Field>
    <div className="cx-form-grid"><Field label="Date du paiement"><input className="cx-input" type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value || todayIso())} /></Field><Field label="Référence" optional><TextInput value={reference} onChange={setReference} /></Field></div>
    <Field label="Message à l’équipe" optional><textarea className="cx-input cx-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex. : le client dit avoir viré lundi." /></Field>
  </Modal>;
}

function ApprovalQueue({ nav }: { nav: Nav }) {
  const d = useData(), waiting = d.payments.filter(p => !p.validated && !p.reversed).sort((a, b) => a.at.localeCompare(b.at));
  const [sel, setSel] = useState<string[]>(() => waiting.map(p => p.id)), [confirm, setConfirm] = useState(false), [decide, setDecide] = useState<{ r: Request; ok: boolean } | null>(null), [answer, setAnswer] = useState(""), [tried, setTried] = useState(false);
  const chosen = waiting.filter(p => sel.includes(p.id)), sum = chosen.reduce((s, p) => s + p.amount, 0);
  const corrections = d.requests.filter(r => r.kind !== "verification" && r.status === "envoyee"), checks = d.requests.filter(r => r.kind === "verification").slice(0, 6);
  function validate() {
    const at = nowIso();
    commit(ME, dd => ({ payments: dd.payments.map(p => sel.includes(p.id) && !p.validated ? { ...p, validated: { at, by: ME } } : p), events: [...chosen.map(p => ({ id: uid(), at, by: ME, text: `Paiement de ${money(p.amount)} validé`, clientId: p.clientId, invoiceId: p.invoiceId, paymentId: p.id })), ...dd.events] }));
    toast(`${chosen.length} paiement${chosen.length > 1 ? "s validés" : " validé"} et verrouillé${chosen.length > 1 ? "s" : ""} · ${money(sum)}.`); setConfirm(false); setSel([]);
  }
  function settle() {
    if (!decide) return; setTried(true); if (!decide.ok && !answer.trim()) return;
    const { r, ok } = decide, at = nowIso();
    if (ok) { const res = applyApproved(r, d, ME); const { text, ...patch } = res; commit(ME, dd => ({ ...patch, requests: dd.requests.map(x => x.id === r.id ? { ...x, status: "approuvee", decidedBy: ME, decidedAt: at, answer: answer.trim() || "Approuvé." } : x) }), { text: `${text} · approuvé par la Direction`, clientId: r.clientId, invoiceId: r.invoiceId, paymentId: r.paymentId }); toast(text); }
    else { commit(ME, dd => ({ requests: dd.requests.map(x => x.id === r.id ? { ...x, status: "refusee", decidedBy: ME, decidedAt: at, answer: answer.trim() } : x) }), { text: `Demande refusée : ${REQUEST_LABEL[r.kind].toLowerCase()} (${answer.trim()})`, clientId: r.clientId, invoiceId: r.invoiceId }); toast("Demande refusée. L’équipe verra votre réponse."); }
    setDecide(null); setAnswer(""); setTried(false);
  }
  return <div className="cx-site-page">
    <h1 className="cx-site-title">À valider</h1>
    <h2 className="cx-h2">Paiements saisis par l’équipe</h2>
    {waiting.length ? <>
      <label className="cx-select-all"><input type="checkbox" checked={chosen.length === waiting.length} onChange={e => setSel(e.target.checked ? waiting.map(p => p.id) : [])} /> Tout sélectionner ({waiting.length})</label>
      <div className="cx-list">{waiting.map(p => { const i = d.invoices.find(x => x.id === p.invoiceId); return <label key={p.id} className={`cx-row cx-check-row${sel.includes(p.id) ? " cx-on" : ""}`}><input type="checkbox" checked={sel.includes(p.id)} onChange={e => setSel(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))} />
        <div className="cx-row-main"><strong>{money(p.amount)} · {p.method}{p.reference && ` · ${p.reference}`}</strong><span className="cx-row-sub">{i?.client.name} · {i?.number} · payé le {dateFr(p.date)} · saisi par {userName(p.by)}{p.versions.length > 0 && <span className="cx-chip cx-tone-warn">corrigé {p.versions.length}×</span>}</span></div></label>; })}</div>
      <div className="cx-sticky-action"><Button kind="primary" wide disabled={!chosen.length} icon={<CheckCheck size={20} />} onClick={() => setConfirm(true)}>{chosen.length ? `Valider ${chosen.length} paiement${chosen.length > 1 ? "s" : ""} · ${money(sum)}` : "Cochez les paiements à valider"}</Button></div>
    </> : <Empty title="Aucun paiement à valider." />}
    <h2 className="cx-h2">Demandes de correction</h2>
    <div className="cx-stack">{corrections.length ? corrections.map(r => <RequestCard key={r.id} r={r} d={d}><div className="cx-card-actions"><Button onClick={() => { setDecide({ r, ok: false }); setAnswer(""); setTried(false); }}>Refuser</Button><Button kind="primary" onClick={() => { setDecide({ r, ok: true }); setAnswer(""); setTried(false); }}>Approuver</Button></div></RequestCard>) : <Empty title="Aucune demande de correction." />}</div>
    {checks.length > 0 && <><h2 className="cx-h2">Vos demandes de vérification</h2><div className="cx-stack">{checks.map(r => <RequestCard key={r.id} r={r} d={d}><div className="cx-card-actions"><Button kind="link" onClick={() => nav({ name: "facture", id: r.invoiceId! })}>Voir la facture</Button></div></RequestCard>)}</div></>}
    {confirm && <Modal title={`Valider ${chosen.length} paiement${chosen.length > 1 ? "s" : ""}`} onClose={() => setConfirm(false)} actions={<><Button kind="link" onClick={() => setConfirm(false)}>Pas maintenant</Button><Button kind="primary" icon={<Lock size={18} />} onClick={validate}>Valider et verrouiller · {money(sum)}</Button></>}>
      <p>Une fois validés, ces paiements ne pourront plus être modifiés par l’équipe. Une erreur se corrigera par une contre-passation que vous approuverez.</p>
      <ul className="cx-mini-list">{chosen.map(p => <li key={p.id}>{money(p.amount)} · {p.method} · {d.invoices.find(x => x.id === p.invoiceId)?.client.name}</li>)}</ul>
    </Modal>}
    {decide && <Modal title={decide.ok ? "Approuver la demande" : "Refuser la demande"} onClose={() => setDecide(null)} actions={<><Button kind="link" onClick={() => setDecide(null)}>Annuler</Button><Button kind="primary" onClick={settle}>{decide.ok ? `Approuver : ${REQUEST_LABEL[decide.r.kind].toLowerCase()}` : "Refuser et répondre"}</Button></>}>
      <div className="cx-recap-sentence">{effect(decide.r, d)}</div>
      {decide.ok ? <p className="cx-muted">Rien n’est effacé : la correction est ajoutée à l’historique avec la raison et votre nom.</p> : null}
      <Field label={decide.ok ? "Message à l’équipe" : "Pourquoi refusez-vous ?"} required={!decide.ok} optional={decide.ok} error={tried && !decide.ok && !answer.trim() ? "Expliquez en quelques mots." : ""}><TextInput value={answer} onChange={setAnswer} autoFocus /></Field>
    </Modal>}
  </div>;
}
function effect(r: Request, d: Data) {
  const i = d.invoices.find(x => x.id === r.invoiceId), p = d.payments.find(x => x.id === r.paymentId), c = d.clients.find(x => x.id === r.clientId);
  if (r.kind === "annulation" && i) return `La facture ${i.number} (${money(invoiceBalance(i, d).total)}) sera marquée ANNULÉE. Son numéro est conservé. Raison : ${r.reason}.`;
  if (r.kind === "avoir" && i) { const b = invoiceBalance(i, d); return `Un avoir de ${money(r.amount ?? 0)} sera créé sur ${i.number}. Reste à payer : ${money(b.due)} → ${money(Math.max(0, b.due - (r.amount ?? 0)))}.`; }
  if (r.kind === "contre-passation" && p) return `Le paiement de ${money(p.amount)} (${p.method}, ${dateFr(p.date)}) sera contre-passé et ne comptera plus. Raison : ${r.reason}.`;
  if (r.kind === "archivage" && c) return `${c.name} n’apparaîtra plus dans les listes. Ses factures et paiements restent consultables.`;
  return "";
}

function Settings() {
  const d = useData(), [reset, setReset] = useState(false), c = d.company;
  return <div className="cx-site-page">
    <h1 className="cx-site-title">Réglages</h1>
    <section className="cx-card cx-details"><h3>Entreprise</h3>{[["Nom", c.name], ["Adresse", c.address], ["Téléphone", c.phone], ["E-mail", c.email], ["NIU", c.niu], ["RCCM", c.rc]].map(([k, v]) => <p key={k}><span>{k}</span><strong>{v}</strong></p>)}</section>
    <section className="cx-card"><h3>Équipe</h3><p>Awa · Facturation (poste du bureau)</p><p>Paul · Encaissement (poste du bureau)</p><p>La Direction · Responsable (ce site)</p></section>
    <section className="cx-card"><h3>Démonstration</h3>
      <p className="cx-muted">Ces boutons servent seulement à essayer la maquette.</p>
      <div className="cx-card-actions cx-left">
        <Button onClick={() => commit(ME, () => ({ officeSyncAt: new Date(new Date().getTime() - 26 * 36e5).toISOString() }))}>Simuler : bureau silencieux depuis hier</Button>
        <Button onClick={() => commit("u-awa", () => ({}))}>Simuler : le bureau se reconnecte</Button>
        <Button onClick={() => setReset(true)}>Recharger les données d’exemple</Button>
        <a className="cx-btn cx-btn-link" href="#ancien">Ouvrir l’ancien prototype</a>
      </div>
    </section>
    {reset && <Modal title="Recharger les données d’exemple ?" onClose={() => setReset(false)} actions={<><Button kind="link" onClick={() => setReset(false)}>Garder mes essais</Button><Button kind="primary" onClick={() => { resetDemo(); setReset(false); toast("Données d’exemple rechargées."); }}>Recharger les exemples</Button></>}><p>Les essais faits dans cette démonstration seront remplacés par les données fictives de départ. Cela ne concerne que ce navigateur.</p></Modal>}
  </div>;
}
