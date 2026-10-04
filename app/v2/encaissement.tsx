import { useEffect, useState } from "react";
import { Banknote, Pencil } from "lucide-react";
import { Button, Choice, Empty, Field, Modal, MoneyInput, MoreMenu, Notice, SearchBox, Stat, TextInput, Timeline, Wizard, matches, toast } from "./ui";
import { PaymentLine, RequestCard, RequestModal, Row, pendingRequest } from "./shared";
import { CORRECTION_REASONS, METHODS, REFERENCE_LABEL, commit, dateFr, daysSince, getData, invoiceBalance, money, nowIso, openInvoices, timeFr, todayIso, uid, useData, userName } from "./store";
import type { Data, Invoice, Payment } from "./store";

export type ERoute = { name: "encaisser" | "paiement" | "paiements" | "detail" | "demandes"; id?: string; payment?: string; request?: string };
type Nav = (r: ERoute) => void;
const ME = "u-paul";

export function EncaissementScreen({ route, nav }: { route: ERoute; nav: Nav }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); nav({ name: "paiement" }); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [nav]);
  switch (route.name) {
    case "paiement": return <PaymentWizard key={`${route.id}-${route.payment}-${route.request}`} invoiceId={route.id} paymentId={route.payment} requestId={route.request} nav={nav} />;
    case "paiements": return <PaymentsPage nav={nav} />;
    case "detail": return <PaymentPage id={route.id!} nav={nav} />;
    case "demandes": return <ChecksPage nav={nav} />;
    default: return <ToCollect nav={nav} />;
  }
}

function ToCollect({ nav }: { nav: Nav }) {
  const d = useData(), [q, setQ] = useState("");
  const open = openInvoices(d).filter(i => matches(q, i.number, i.client.name));
  const groups = [...new Set(open.map(i => i.clientId))].map(id => ({ client: open.find(i => i.clientId === id)!.client, invoices: open.filter(i => i.clientId === id).sort((a, b) => a.date.localeCompare(b.date)) })).sort((a, b) => a.client.name.localeCompare(b.client.name));
  const today = d.payments.filter(p => p.date === todayIso() && !p.reversed), checks = d.requests.filter(r => r.kind === "verification" && r.status === "envoyee").length;
  return <div className="cx-page">
    <header className="cx-page-head"><div><h1>À encaisser</h1><p>Bonjour Paul. Choisissez la facture que le client a payée.</p></div><Button kind="primary" icon={<Banknote size={20} />} onClick={() => nav({ name: "paiement" })}>Enregistrer un paiement</Button></header>
    <div className="cx-tiles">
      <button type="button" className="cx-tile cx-tile-good" onClick={() => nav({ name: "paiements" })}><strong>{money(today.reduce((s, p) => s + p.amount, 0))}</strong><span>encaissé aujourd’hui · {today.length} paiement{today.length > 1 ? "s" : ""}</span></button>
      <button type="button" className={`cx-tile${checks ? " cx-tile-warn" : ""}`} onClick={() => nav({ name: "demandes" })}><strong>{checks}</strong><span>vérification{checks > 1 ? "s" : ""} demandée{checks > 1 ? "s" : ""} par le responsable</span></button>
      <div className="cx-tile cx-tile-static"><strong>{money(openInvoices(d).reduce((s, i) => s + invoiceBalance(i, d).due, 0))}</strong><span>reste à recevoir · {openInvoices(d).length} factures</span></div>
    </div>
    <SearchBox value={q} onChange={setQ} placeholder="Chercher un client ou un numéro de facture" />
    {groups.length ? groups.map(g => <section key={g.client.id} className="cx-group"><h2>{g.client.name}<span>{money(g.invoices.reduce((s, i) => s + invoiceBalance(i, d).due, 0))}</span></h2>
      <div className="cx-list">{g.invoices.map(i => <OpenInvoiceRow key={i.id} i={i} d={d} onClick={() => nav({ name: "paiement", id: i.id })} />)}</div></section>)
      : <Empty title={q ? "Aucune facture ouverte ne correspond." : "Tout est encaissé. Bravo !"} />}
  </div>;
}
function OpenInvoiceRow({ i, d, onClick }: { i: Invoice; d: Data; onClick: () => void }) {
  const b = invoiceBalance(i, d), age = daysSince(i.date);
  return <Row onClick={onClick} aside={<><small>reste à payer</small><strong className="cx-amount">{money(b.due)}</strong></>}>
    <strong>{i.number}</strong><span className="cx-row-sub">{dateFr(i.date)} · total {money(b.total)}{b.received > 0 && <> · déjà reçu {money(b.received)}</>} {age > 30 && <span className={`cx-chip cx-tone-${age > 60 ? "bad" : "warn"}`}>{age} jours</span>}</span>
  </Row>;
}

function PaymentWizard({ invoiceId, paymentId, requestId, nav }: { invoiceId?: string; paymentId?: string; requestId?: string; nav: Nav }) {
  const d = useData(), editing = d.payments.find(p => p.id === paymentId), req = d.requests.find(r => r.id === requestId);
  const [invId, setInvId] = useState(editing?.invoiceId ?? req?.invoiceId ?? invoiceId ?? "");
  const [step, setStep] = useState(editing || invId ? 1 : 0), [q, setQ] = useState(""), [tried, setTried] = useState(false), [saved, setSaved] = useState<Payment | null>(null);
  const [amount, setAmount] = useState(() => editing?.amount ?? req?.amount ?? (invoiceId && getData().invoices.some(i => i.id === invoiceId) ? invoiceBalance(getData().invoices.find(i => i.id === invoiceId)!, getData()).due : 0)), [method, setMethod] = useState(editing?.method ?? req?.method ?? ""), [reference, setReference] = useState(editing?.reference ?? req?.reference ?? "");
  const [date, setDate] = useState(editing?.date ?? req?.paymentDate ?? todayIso()), [reason, setReason] = useState(""), [sure, setSure] = useState(false);
  const inv = d.invoices.find(i => i.id === invId), b = inv ? invoiceBalance(inv, d) : null;
  const room = b ? b.due + (editing && !editing.reversed ? editing.amount : 0) : 0;
  const dup = inv && d.payments.find(p => p.id !== editing?.id && p.invoiceId === inv.id && !p.reversed && p.amount === amount && p.method === method && (p.reference || "") === reference.trim() && Math.abs(daysSince(p.date) - daysSince(date)) <= 7);
  const err = {
    amount: !amount ? "Indiquez le montant reçu." : amount > room ? `Le montant dépasse le reste à payer (${money(room)}). Si le client a réglé plusieurs factures, enregistrez un paiement par facture.` : "",
    method: !method ? "Choisissez le mode de paiement." : "",
    reference: method && method !== "Espèces" && !reference.trim() ? `Indiquez le ${REFERENCE_LABEL[method].toLowerCase()}.` : "",
    date: !date ? "Indiquez la date." : date > todayIso() ? "La date ne peut pas être dans le futur." : "",
    reason: editing && !reason ? "Choisissez la raison de la correction." : "",
    dup: dup && !sure ? "Confirmez qu’il s’agit bien d’un autre paiement." : "",
  };
  const ok = Object.values(err).every(e => !e);
  const steps = editing ? ["Corriger", "Vérifier"] : ["Facture", "Montant et mode", "Vérifier"];
  const show = (k: keyof typeof err) => tried ? err[k] : "";
  function save() {
    if (!inv) return;
    const at = nowIso(), ref = method === "Espèces" ? "" : reference.trim();
    if (editing) {
      const next: Payment = { ...editing, amount, method, reference: ref, date, versions: [...editing.versions, { amount: editing.amount, method: editing.method, reference: editing.reference, date: editing.date, at, by: ME, reason }] };
      commit(ME, dd => ({ payments: dd.payments.map(p => p.id === editing.id ? next : p) }), { text: `Paiement corrigé : ${money(editing.amount)} ${editing.method} → ${money(amount)} ${method} (${reason})`, clientId: inv.clientId, invoiceId: inv.id, paymentId: editing.id });
      setSaved(next); return;
    }
    const p: Payment = { id: uid(), invoiceId: inv.id, clientId: inv.clientId, amount, method, reference: ref, date, by: ME, at, versions: [] };
    commit(ME, dd => ({ payments: [p, ...dd.payments], requests: req ? dd.requests.map(r => r.id === req.id ? { ...r, status: "traitee", readAt: r.readAt ?? at, decidedBy: ME, decidedAt: at, linkedPaymentId: p.id, answer: `Paiement enregistré : ${money(amount)} par ${method} le ${dateFr(date)}.` } : r) : dd.requests }),
      { text: `Paiement de ${money(amount)} par ${method} sur ${inv.number}`, clientId: inv.clientId, invoiceId: inv.id, paymentId: p.id });
    setSaved(p);
  }
  if (saved && inv) return <div className="cx-page cx-success">
    <div className="cx-success-mark">✓</div>
    <h1>{editing ? "Paiement corrigé" : "Paiement enregistré"}</h1>
    <p className="cx-lead"><strong>{money(saved.amount)}</strong> par {saved.method} · facture {inv.number} · {inv.client.name}</p>
    <p className="cx-muted">Reste à payer sur cette facture : {money(invoiceBalance(inv, getData()).due)}. Le responsable validera ce paiement.</p>
    <div className="cx-actions-center"><Button kind="primary" icon={<Banknote size={20} />} onClick={() => nav({ name: "paiement", id: "x" + Date.now() })}>Enregistrer un autre paiement</Button><Button onClick={() => nav({ name: "encaisser" })}>Retour à la liste</Button></div>
  </div>;
  const list = openInvoices(d).filter(i => matches(q, i.number, i.client.name)).sort((a, b2) => a.client.name.localeCompare(b2.client.name) || a.date.localeCompare(b2.date));
  return <Wizard title={editing ? "Corriger un paiement" : "Enregistrer un paiement"} steps={steps} step={step - (editing ? 1 : 0)} onBack={() => setStep(s => s - 1)} onExit={() => nav(editing ? { name: "detail", id: editing.id } : { name: "encaisser" })}
    next={step === 0 ? <Button kind="primary" disabled={!inv} onClick={() => setStep(1)}>Continuer</Button>
      : step === 1 ? <Button kind="primary" onClick={() => { setTried(true); if (ok) setStep(2); }}>Continuer : vérifier</Button>
      : <Button kind="primary" onClick={save}>{editing ? "Enregistrer la correction" : `Enregistrer le paiement de ${money(amount)}`}</Button>}>
    {step === 0 && <>
      <div className="cx-step-intro"><h2>Quelle facture le client a-t-il payée ?</h2><p>Seules les factures avec un reste à payer apparaissent.</p></div>
      <SearchBox value={q} onChange={setQ} placeholder="Client ou numéro de facture" />
      <div className="cx-list">{list.map(i => <OpenInvoiceRow key={i.id} i={i} d={d} onClick={() => { setInvId(i.id); setAmount(invoiceBalance(i, d).due); setStep(1); }} />)}{!list.length && <Empty title="Aucune facture ouverte ne correspond." />}</div>
    </>}
    {step === 1 && inv && b && <div className="cx-narrow">
      {req && <Notice title="Demande du responsable">{req.note || "Vérifier ce paiement."} Les champs sont pré-remplis avec ce qu’il a signalé : vérifiez-les avec le relevé.</Notice>}
      <div className="cx-chosen"><div><small>Facture</small><strong>{inv.number} · {inv.client.name}</strong><span>Reste à payer : <b>{money(room)}</b> sur {money(b.total)}</span></div>{!editing && !req && <Button kind="link" onClick={() => setStep(0)}>Changer</Button>}</div>
      {editing && <Field label="Raison de la correction" required error={show("reason")}><Choice columns={3} value={reason} onChange={setReason} options={CORRECTION_REASONS.filter(r => r !== "Doublon").map(r => ({ value: r, label: r }))} /></Field>}
      <Field label="Montant reçu" required error={show("amount")} hint={amount && amount < room ? `Paiement partiel : il restera ${money(room - amount)}.` : undefined}><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
      {amount !== room && <button type="button" className="cx-btn cx-btn-link cx-inline" onClick={() => setAmount(room)}>Mettre tout le reste ({money(room)})</button>}
      <Field label="Mode de paiement" required error={show("method")}><Choice columns={5} value={method} onChange={v => { setMethod(v); if (v === "Espèces") setReference(""); }} options={METHODS.map(m => ({ value: m, label: m }))} /></Field>
      {method && method !== "Espèces" && <Field label={REFERENCE_LABEL[method]} required error={show("reference")}><TextInput value={reference} onChange={setReference} /></Field>}
      <Field label="Date du paiement" required error={show("date")}><input className="cx-input" type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} /></Field>
      {dup && <Notice tone="warn" title="Ce paiement ressemble à un autre">{money(dup.amount)} par {dup.method} du {dateFr(dup.date)}, saisi par {userName(dup.by)}.
        <label className="cx-confirm"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} /> Je confirme que c’est un autre paiement</label>{show("dup") && <span className="cx-error">{err.dup}</span>}</Notice>}
    </div>}
    {step === 2 && inv && b && <div className="cx-narrow">
      <div className="cx-step-intro"><h2>Vérifiez avant d’enregistrer</h2></div>
      <div className="cx-recap-sentence cx-big">{editing ? "Correction : " : ""}Paiement de <strong>{money(amount)}</strong> par <strong>{method}</strong>{reference && method !== "Espèces" && <> (réf. {reference})</>} le {dateFr(date)}, sur la facture <strong>{inv.number}</strong> · {inv.client.name}.</div>
      <div className="cx-before-after"><Stat label="Reste à payer avant" value={money(room)} /><span aria-hidden>→</span><Stat label="Reste à payer après" value={money(room - amount)} tone={room - amount ? "warn" : "good"} /></div>
      {editing && <Notice>L’ancienne version ({money(editing.amount)} · {editing.method}) reste dans l’historique du paiement.</Notice>}
    </div>}
  </Wizard>;
}

function PaymentsPage({ nav }: { nav: Nav }) {
  const d = useData(), [filter, setFilter] = useState("jour"), [q, setQ] = useState("");
  const list = d.payments.filter(p => filter === "jour" ? p.date === todayIso() : filter === "attente" ? !p.validated && !p.reversed : filter === "valides" ? !!p.validated : true)
    .filter(p => { const i = d.invoices.find(x => x.id === p.invoiceId); return matches(q, i?.number, i?.client.name, p.reference, p.method); }).sort((a, b) => b.at.localeCompare(a.at));
  const total = list.filter(p => !p.reversed).reduce((s, p) => s + p.amount, 0);
  return <div className="cx-page">
    <header className="cx-page-head"><div><h1>Paiements</h1><p>Total de cette liste : <strong>{money(total)}</strong></p></div><Button kind="primary" icon={<Banknote size={20} />} onClick={() => nav({ name: "paiement" })}>Enregistrer un paiement</Button></header>
    <SearchBox value={q} onChange={setQ} placeholder="Client, facture, référence" autoFocus={false} />
    <div className="cx-filters">{[["jour", "Aujourd’hui"], ["attente", "En attente de validation"], ["valides", "Validés"], ["tous", "Tous"]].map(([k, l]) => <button type="button" key={k} className={filter === k ? "cx-on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
    <div className="cx-list">{list.length ? list.map(p => <PaymentLine key={p.id} p={p} d={d} onClick={() => nav({ name: "detail", id: p.id })} />) : <Empty title="Aucun paiement dans cette liste." />}</div>
  </div>;
}

function PaymentPage({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), p = d.payments.find(x => x.id === id), [reverse, setReverse] = useState(false), [ask, setAsk] = useState(false), [reason, setReason] = useState(""), [tried, setTried] = useState(false);
  if (!p) return <Empty title="Paiement introuvable." />;
  const i = d.invoices.find(x => x.id === p.invoiceId)!, pending = pendingRequest(d, r => r.paymentId === p.id);
  const canFix = !p.validated && !p.reversed && p.by === ME && p.at.slice(0, 10) === new Date().toISOString().slice(0, 10);
  const more = p.reversed || pending ? [] : p.validated ? [{ label: "Demander une contre-passation", hint: "Le paiement est validé : le responsable doit accepter", onClick: () => setAsk(true) }]
    : [{ label: "Contre-passer ce paiement", hint: "Doublon ou mauvaise facture ; il restera visible, barré", onClick: () => setReverse(true) }];
  function doReverse() {
    setTried(true); if (!reason) return;
    commit(ME, dd => ({ payments: dd.payments.map(x => x.id === p!.id ? { ...x, reversed: { at: nowIso(), by: ME, reason } } : x) }), { text: `Paiement de ${money(p!.amount)} contre-passé (${reason})`, clientId: p!.clientId, invoiceId: p!.invoiceId, paymentId: p!.id });
    toast(`Paiement de ${money(p!.amount)} contre-passé. Le reste à payer de ${i.number} a été remis à jour.`); setReverse(false);
  }
  return <div className="cx-page">
    <button type="button" className="cx-back" onClick={() => nav({ name: "paiements" })}>← Paiements</button>
    <header className="cx-page-head"><div><h1 className={p.reversed ? "cx-struck" : ""}>Paiement de {money(p.amount)}</h1><p>{i.number} · {i.client.name}</p></div>
      <div className="cx-head-actions"><MoreMenu items={more} />{canFix && <Button icon={<Pencil size={18} />} onClick={() => nav({ name: "paiement", payment: p.id })}>Corriger</Button>}</div></header>
    {p.reversed && <Notice tone="bad" title="Contre-passé">Par {userName(p.reversed.by)} le {timeFr(p.reversed.at)} · {p.reversed.reason}. Il ne compte plus dans le solde.</Notice>}
    {p.validated ? <Notice tone="good" title="Validé par le responsable">Le {timeFr(p.validated.at)}. Il ne peut plus être corrigé directement.</Notice> : !p.reversed && <Notice tone="warn">En attente de validation par le responsable.{canFix ? " Vous pouvez encore le corriger aujourd’hui." : ""}</Notice>}
    {pending && <Notice tone="warn">Contre-passation demandée le {dateFr(pending.at)}, en attente du responsable.</Notice>}
    <div className="cx-card cx-details">{[["Montant", money(p.amount)], ["Mode", p.method], ["Référence", p.reference || "—"], ["Date du paiement", dateFr(p.date)], ["Saisi par", `${userName(p.by)}, ${timeFr(p.at)}`]].map(([k, v]) => <p key={k}><span>{k}</span><strong>{v}</strong></p>)}</div>
    {p.versions.length > 0 && <><h2 className="cx-h2">Versions précédentes</h2><div className="cx-list">{p.versions.map((v, k) => <div key={k} className="cx-row cx-row-static"><div className="cx-row-main"><strong className="cx-struck">{money(v.amount)} · {v.method}{v.reference && ` · ${v.reference}`}</strong><span className="cx-row-sub">Remplacé le {timeFr(v.at)} par {userName(v.by)} · {v.reason}</span></div></div>)}</div></>}
    <h2 className="cx-h2">Historique</h2><Timeline events={d.events.filter(e => e.paymentId === p.id)} />
    {reverse && <Modal title="Contre-passer ce paiement" onClose={() => setReverse(false)} actions={<><Button kind="link" onClick={() => setReverse(false)}>Ne rien faire</Button><Button kind="primary" onClick={doReverse}>Contre-passer le paiement de {money(p.amount)}</Button></>}>
      <Notice>Le paiement ne sera pas effacé : il restera visible, barré, avec votre nom et la raison.</Notice>
      <Field label="Raison" required error={tried && !reason ? "Choisissez une raison." : ""}><Choice columns={2} value={reason} onChange={setReason} options={["Doublon", "Mauvaise facture", "Mauvais client", "Paiement non reçu"].map(r => ({ value: r, label: r }))} /></Field>
    </Modal>}
    {ask && <RequestModal kind="contre-passation" by={ME} payment={p} invoice={i} client={i.client} onClose={() => setAsk(false)} />}
  </div>;
}

function ChecksPage({ nav }: { nav: Nav }) {
  const d = useData(), [noneFor, setNoneFor] = useState<string | null>(null), [answer, setAnswer] = useState(""), [tried, setTried] = useState(false);
  const checks = d.requests.filter(r => r.kind === "verification"), open = checks.filter(r => r.status === "envoyee"), done = checks.filter(r => r.status !== "envoyee");
  useEffect(() => { if (open.some(r => !r.readAt)) commit(ME, dd => ({ requests: dd.requests.map(r => r.kind === "verification" && r.status === "envoyee" && !r.readAt ? { ...r, readAt: nowIso() } : r) })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function close(id: string, text: string, linked?: string) {
    const at = nowIso();
    commit(ME, dd => ({ requests: dd.requests.map(r => r.id === id ? { ...r, status: "traitee", decidedBy: ME, decidedAt: at, answer: text, linkedPaymentId: linked } : r) }), { text: `Vérification traitée : ${text}`, clientId: d.requests.find(r => r.id === id)?.clientId });
    toast("Réponse envoyée au responsable.");
  }
  return <div className="cx-page">
    <header className="cx-page-head"><div><h1>Demandes du responsable</h1><p>Il signale un paiement : retrouvez-le ou enregistrez-le.</p></div></header>
    <div className="cx-stack">{open.length ? open.map(r => { const found = d.payments.filter(p => p.invoiceId === r.invoiceId && !p.reversed); return <RequestCard key={r.id} r={r} d={d}>
      {found.length > 0 && <><p className="cx-label">Paiements déjà enregistrés sur cette facture :</p><div className="cx-list cx-list-tight">{found.map(p => <div key={p.id} className="cx-row cx-row-static"><div className="cx-row-main"><strong>{money(p.amount)} · {p.method}{p.reference && ` · ${p.reference}`}</strong><span className="cx-row-sub">{dateFr(p.date)}</span></div><Button onClick={() => close(r.id, `Paiement déjà enregistré : ${money(p.amount)} par ${p.method} le ${dateFr(p.date)}.`, p.id)}>C’est celui-ci</Button></div>)}</div></>}
      <div className="cx-card-actions"><Button kind="link" onClick={() => { setNoneFor(r.id); setAnswer(""); setTried(false); }}>Aucun paiement trouvé</Button><Button kind="primary" icon={<Banknote size={18} />} onClick={() => nav({ name: "paiement", request: r.id })}>Enregistrer ce paiement</Button></div>
    </RequestCard>; }) : <Empty title="Aucune demande à traiter." />}</div>
    {done.length > 0 && <><h2 className="cx-h2">Déjà traitées</h2><div className="cx-stack">{done.map(r => <RequestCard key={r.id} r={r} d={d} />)}</div></>}
    {noneFor && <Modal title="Aucun paiement trouvé" onClose={() => setNoneFor(null)} actions={<><Button kind="link" onClick={() => setNoneFor(null)}>Annuler</Button><Button kind="primary" onClick={() => { setTried(true); if (answer.trim()) { close(noneFor, answer.trim()); setNoneFor(null); } }}>Envoyer la réponse</Button></>}>
      <p>Expliquez ce que vous avez vérifié. Le solde du client ne change pas.</p>
      <Field label="Votre réponse" required error={tried && !answer.trim() ? "Écrivez une courte réponse." : ""}><textarea className="cx-input cx-textarea" rows={3} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Ex. : rien sur le relevé bancaire du 01 au 04/10." autoFocus /></Field>
    </Modal>}
  </div>;
}
