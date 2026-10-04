import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { Button, Choice, Field, Modal, MoneyInput, Notice, StatusChip, TextInput, toast } from "./ui";
import { CORRECTION_REASONS, REQUEST_LABEL, commit, dateFr, getData, invoiceBalance, invoiceStatus, money, nowIso, timeFr, uid, userName } from "./store";
import type { Client, Data, Invoice, Payment, Request, RequestKind } from "./store";

function snapshot(x: Client): Omit<Client, "history"> { const copy: Partial<Client> = { ...x }; delete copy.history; return copy as Omit<Client, "history">; }

export function ClientForm({ client, by, onClose, onSaved }: { client: Client; by: string; onClose: () => void; onSaved: (c: Client) => void }) {
  const [c, setC] = useState(client), [tried, setTried] = useState(false);
  const isNew = !getData().clients.some(x => x.id === client.id);
  const same = getData().clients.find(x => x.id !== c.id && x.name.trim().toLowerCase() === c.name.trim().toLowerCase() && c.name.trim());
  const nameError = tried && !c.name.trim() ? "Écrivez le nom du client." : same ? `Un client s’appelle déjà « ${same.name} ».` : "";
  const set = (k: keyof Client) => (v: string) => setC({ ...c, [k]: v });
  function save() {
    setTried(true); if (!c.name.trim() || same) return;
    const clean = { ...c, name: c.name.trim() };
    if (isNew) commit(by, d => ({ clients: [...d.clients, clean] }), { text: `Client ${clean.name} créé`, clientId: clean.id });
    else commit(by, d => ({ clients: d.clients.map(x => x.id === c.id ? { ...clean, history: [...x.history, { at: nowIso(), by, before: snapshot(x) }] } : x) }), { text: `Coordonnées de ${clean.name} modifiées`, clientId: clean.id });
    toast(isNew ? `Client « ${clean.name} » créé.` : `Coordonnées de « ${clean.name} » enregistrées. L’ancienne version reste dans l’historique.`);
    onSaved(clean);
  }
  return <Modal title={isNew ? "Nouveau client" : `Modifier ${client.name}`} onClose={onClose} actions={<><Button kind="link" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={save}>{isNew ? "Créer le client" : "Enregistrer les modifications"}</Button></>}>
    <form className="cx-form-grid" onSubmit={e => { e.preventDefault(); save(); }}>
      <Field label="Nom du client" required error={nameError}><TextInput value={c.name} onChange={set("name")} autoFocus placeholder="Ex. : EFMK SARL" /></Field>
      <Field label="Personne à contacter" optional><TextInput value={c.contact} onChange={set("contact")} /></Field>
      <Field label="Téléphone" optional><TextInput value={c.phone} onChange={set("phone")} inputMode="tel" placeholder="+237 6 .. .. .. .." /></Field>
      <Field label="E-mail" optional><TextInput value={c.email} onChange={set("email")} inputMode="email" /></Field>
      <Field label="Adresse" optional><TextInput value={c.address} onChange={set("address")} /></Field>
      <Field label="NIU" optional hint="Numéro d’identifiant unique, s’il figure sur la facture."><TextInput value={c.niu} onChange={set("niu")} /></Field>
      <Field label="RCCM" optional><TextInput value={c.rc} onChange={set("rc")} /></Field>
      <button type="submit" hidden />
    </form>
    {!isNew && <p className="cx-muted">Les factures déjà émises gardent les coordonnées imprimées à leur date.</p>}
  </Modal>;
}

/** Office staff never undo by themselves: they ask, the manager decides, everything stays traceable. */
export function RequestModal({ kind, by, invoice, payment, client, onClose }: { kind: Exclude<RequestKind, "verification">; by: string; invoice?: Invoice; payment?: Payment; client: Client; onClose: () => void }) {
  const d = getData(), [reason, setReason] = useState(""), [note, setNote] = useState(""), [amount, setAmount] = useState(0), [tried, setTried] = useState(false);
  const bal = invoice ? invoiceBalance(invoice, d) : null, maxCredit = bal ? bal.total - bal.credited : 0;
  const amountError = kind === "avoir" && tried ? !amount ? "Indiquez le montant à retirer de la facture." : amount > maxCredit ? `Au maximum ${money(maxCredit)}.` : "" : "";
  const reasonError = tried && !reason ? "Choisissez une raison." : tried && reason === "Autre" && !note.trim() ? "Expliquez la raison en quelques mots." : "";
  const what = kind === "annulation" ? `Annuler la facture ${invoice?.number} (${money(bal?.total ?? 0)}). Son numéro sera conservé et marqué ANNULÉE.`
    : kind === "avoir" ? `Retirer ${money(amount)} de la facture ${invoice?.number} par un avoir.`
    : kind === "contre-passation" ? `Contre-passer le paiement de ${money(payment?.amount ?? 0)} du ${dateFr(payment?.date ?? "")}. Il restera visible, barré.`
    : `Archiver le client ${client.name}. Ses factures et paiements restent consultables.`;
  function send() {
    setTried(true);
    if (!reason || (reason === "Autre" && !note.trim()) || (kind === "avoir" && (!amount || amount > maxCredit))) return;
    const r: Request = { id: uid(), kind, status: "envoyee", clientId: client.id, invoiceId: invoice?.id, paymentId: payment?.id, amount: kind === "avoir" ? amount : undefined, reason, note: note.trim(), by, at: nowIso() };
    commit(by, dd => ({ requests: [r, ...dd.requests] }), { text: `Demande envoyée : ${REQUEST_LABEL[kind].toLowerCase()} (${reason})`, clientId: client.id, invoiceId: invoice?.id, paymentId: payment?.id });
    toast("Demande envoyée au responsable. Vous verrez sa réponse dans « Demandes ».");
    onClose();
  }
  return <Modal title={`Demander : ${REQUEST_LABEL[kind].toLowerCase()}`} onClose={onClose} actions={<><Button kind="link" onClick={onClose}>Ne rien demander</Button><Button kind="primary" onClick={send}>Envoyer la demande au responsable</Button></>}>
    <Notice>Rien n’est effacé. Le responsable valide la demande, puis la correction apparaît dans l’historique avec votre nom et la raison.</Notice>
    {kind === "avoir" && <Field label="Montant à retirer" required error={amountError} hint={`Maximum : ${money(maxCredit)}`}><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>}
    <Field label="Raison" required error={reasonError}><Choice columns={2} value={reason} onChange={setReason} options={CORRECTION_REASONS.map(r => ({ value: r, label: r }))} /></Field>
    <Field label="Explication" optional={reason !== "Autre"} required={reason === "Autre"}><textarea className="cx-input cx-textarea" value={note} onChange={e => setNote(e.target.value)} rows={3} /></Field>
    <div className="cx-recap-sentence">{what}</div>
  </Modal>;
}
export function pendingRequest(d: Data, f: (r: Request) => boolean) { return d.requests.find(r => r.status === "envoyee" && f(r)); }

export function Row({ onClick, children, aside }: { onClick?: () => void; children: ReactNode; aside?: ReactNode }) {
  return <button type="button" className="cx-row" onClick={onClick}><div className="cx-row-main">{children}</div>{aside && <div className="cx-row-aside">{aside}</div>}<ChevronRight size={20} className="cx-row-go" /></button>;
}
export function InvoiceRow({ i, d, onClick, showClient = true }: { i: Invoice; d: Data; onClick: () => void; showClient?: boolean }) {
  const b = invoiceBalance(i, d), s = invoiceStatus(i, d);
  return <Row onClick={onClick} aside={<><strong className="cx-amount">{money(b.total)}</strong>{b.due > 0 && s !== "Brouillon" && b.due !== b.total && <small>reste {money(b.due)}</small>}</>}>
    <strong>{i.number ?? "Brouillon"}{showClient && <> · {i.client.name || "client à choisir"}</>}</strong>
    <span className="cx-row-sub"><StatusChip status={s} /> {dateFr(i.date)}</span>
  </Row>;
}
export function PaymentLine({ p, d, onClick }: { p: Payment; d: Data; onClick?: () => void }) {
  const i = d.invoices.find(x => x.id === p.invoiceId);
  const body = <><div className="cx-row-main"><strong className={p.reversed ? "cx-struck" : ""}>{money(p.amount)} · {p.method}{p.reference && <> · {p.reference}</>}</strong>
    <span className="cx-row-sub">{p.reversed ? <span className="cx-chip cx-tone-bad">Contre-passé</span> : p.validated ? <span className="cx-chip cx-tone-good"><Lock size={12} /> Validé</span> : <span className="cx-chip cx-tone-warn">En attente de validation</span>} {dateFr(p.date)} · {i?.number} · {i?.client.name} · saisi par {userName(p.by)}</span></div></>;
  return onClick ? <button type="button" className="cx-row" onClick={onClick}>{body}<ChevronRight size={20} className="cx-row-go" /></button> : <div className="cx-row cx-row-static">{body}</div>;
}
export function RequestCard({ r, d, children }: { r: Request; d: Data; children?: ReactNode }) {
  const i = d.invoices.find(x => x.id === r.invoiceId), c = d.clients.find(x => x.id === r.clientId), p = d.payments.find(x => x.id === r.paymentId);
  const tone = r.status === "envoyee" ? "warn" : r.status === "refusee" ? "bad" : "good";
  const label = r.status === "envoyee" ? (r.kind === "verification" ? (r.readAt ? "Lue" : "Reçue sur le poste") : "En attente du responsable") : r.status === "approuvee" ? "Approuvée" : r.status === "refusee" ? "Refusée" : "Traitée";
  return <article className="cx-card cx-request">
    <header><strong>{REQUEST_LABEL[r.kind]}</strong><span className={`cx-chip cx-tone-${tone}`}>{label}</span></header>
    <p className="cx-row-sub">{c?.name}{i && <> · facture {i.number}</>}{p && <> · paiement de {money(p.amount)} du {dateFr(p.date)}</>} · {userName(r.by)}, {timeFr(r.at)}</p>
    {r.kind === "verification" ? <p>Paiement signalé : <strong>{money(r.amount ?? 0)}</strong> par {r.method} le {dateFr(r.paymentDate ?? "")}{r.reference && <> · réf. {r.reference}</>}</p>
      : <p>{r.amount ? <><strong>{money(r.amount)}</strong> · </> : null}Raison : {r.reason}</p>}
    {r.note && <blockquote>« {r.note} »</blockquote>}
    {r.answer && <p className="cx-answer"><strong>Réponse de {userName(r.decidedBy ?? "")} :</strong> {r.answer}</p>}
    {children}
  </article>;
}
