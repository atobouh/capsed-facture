import { useState } from "react";
import { Archive, ArrowRight, FilePlus2, FileText, Pencil, Plus, Printer, RotateCcw, UserPlus, Wallet } from "lucide-react";
import { Button, Confirm, Empty, Field, Modal, PageHead, SearchBox, StatusChip, TextInput, matches, toast } from "./ui";
import { CancelPayment, CreditModal, LockBadge, PaymentModal } from "./payments";
import { accountName, accountTotals, balance, commit, dateFr, getData, money, nowIso, uid, useData } from "./store";
import type { Client, Role } from "./store";

export type OfficeRoute = { name: string; id?: string; extra?: string };
type Nav = (r: OfficeRoute) => void;

export function ClientForm({ client, by, requestId, onClose, onSaved }: { client: Client; by: string; requestId?: string; onClose: () => void; onSaved: (c: Client) => void }) {
  const [c, setC] = useState(client), [tried, setTried] = useState(false);
  const isNew = !client.id;
  const same = getData().clients.find(x => x.id !== c.id && x.name.trim().toLowerCase() === c.name.trim().toLowerCase() && !!c.name.trim());
  const nameError = tried && !c.name.trim() ? "Écrivez le nom du client." : same ? `Un client s’appelle déjà « ${same.name} »${same.archived ? " (archivé)" : ""}.` : "";
  const set = (k: keyof Client) => (v: string) => setC({ ...c, [k]: v });
  function save() {
    setTried(true); if (!c.name.trim() || same) return;
    const clean = { ...c, name: c.name.trim(), id: c.id || uid() };
    commit(by, d => ({ clients: isNew ? [...d.clients, clean] : d.clients.map(x => x.id === clean.id ? clean : x),
      requests: requestId ? d.requests.map(r => r.id === requestId ? { ...r, readAt: r.readAt ?? nowIso(), resolvedAt: nowIso(), resolvedBy: by, linkedId: clean.id, response: `Client « ${clean.name} » créé.` } : r) : d.requests }),
      { text: isNew ? `Client ${clean.name} ajouté` : `Coordonnées de ${clean.name} modifiées`, clientId: clean.id });
    toast(isNew ? `Client « ${clean.name} » enregistré.` : "Coordonnées enregistrées. Les factures déjà émises gardent les coordonnées imprimées.");
    onSaved(clean);
  }
  const fields: [keyof Client, string, string?][] = [["contact", "Personne à contacter"], ["phone", "Téléphone", "+237 6 .. .. .. .."], ["email", "Adresse e-mail"], ["address", "Adresse"], ["niu", "NIU"], ["rc", "RCCM"]];
  return <Modal title={isNew ? "Ajouter un client" : "Modifier le client"} subtitle="Seul le nom est obligatoire. Les informations manquantes ne seront pas imprimées." onClose={onClose}
    actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={save}>Enregistrer le client</Button></>}>
    <form className="cx-form-grid" onSubmit={e => { e.preventDefault(); save(); }}>
      <Field label="Nom du client" required error={nameError} wide><TextInput value={c.name} onChange={set("name")} autoFocus placeholder="Ex. EFMK SARL" /></Field>
      {fields.map(([k, label, ph]) => <Field key={k} label={label} optional wide={k === "address"}><TextInput value={String(c[k] ?? "")} onChange={set(k)} placeholder={ph} /></Field>)}
      <button type="submit" hidden />
    </form>
  </Modal>;
}

export function ClientsDirectory({ role, by, nav }: { role: Role; by: string; nav: Nav }) {
  const d = useData(), [q, setQ] = useState(""), [archived, setArchived] = useState(false), [onlyDue, setOnlyDue] = useState(false), [form, setForm] = useState<Client | null>(null);
  const all = accountTotals(d.invoices, d.payments, d.credits);
  const list = d.clients.filter(c => !!c.archived === archived && matches(q, c.name, c.phone, c.contact, c.niu)).filter(c => !onlyDue || accountTotals(d.invoices.filter(i => i.client.id === c.id), d.payments, d.credits).due > 0).sort((a, b) => a.name.localeCompare(b.name));
  return <div className="cx-page">
    <PageHead kicker={role === "encaissement" ? "Clients & paiements" : "Clients"} title={role === "encaissement" ? "Clients & paiements" : "Clients"} sub="Ouvrez un client pour voir toutes ses factures, même celles des mois clôturés."
      actions={<><Button icon={<Printer size={18} />} onClick={() => nav({ name: "situation" })}>Situation globale</Button>{role === "facturation" && <Button kind="primary" icon={<UserPlus size={18} />} onClick={() => setForm({ id: "", name: "", contact: "", address: "", phone: "", email: "", niu: "", rc: "" })}>Ajouter un client</Button>}</>} />
    <div className="cx-metrics"><div><span>{archived ? "Clients archivés" : "Clients actifs"}</span><strong>{d.clients.filter(c => !!c.archived === archived).length}</strong></div><div><span>Paiements reçus</span><strong>{money(all.received)}</strong></div><div className="cx-metric-accent"><span>Reste à recevoir · tous les mois</span><strong>{money(all.due)}</strong></div></div>
    <div className="cx-card cx-card-flush">
      <div className="cx-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Chercher un client…" />
        <button type="button" className={`cx-pill${onlyDue ? " cx-on" : ""}`} aria-pressed={onlyDue} onClick={() => setOnlyDue(v => !v)}>Avec un reste à payer</button>
        <button type="button" className={`cx-pill${archived ? " cx-on" : ""}`} aria-pressed={archived} onClick={() => setArchived(v => !v)}>{archived ? "Voir les clients actifs" : `Archivés (${d.clients.filter(c => c.archived).length})`}</button></div>
      <div className="cx-directory">{list.map(c => { const items = d.invoices.filter(i => i.client.id === c.id), a = accountTotals(items, d.payments, d.credits);
        return <button type="button" className="cx-dir-row" key={c.id} onClick={() => nav({ name: "client", id: c.id })}><span className="cx-monogram">{c.name.slice(0, 2).toUpperCase()}</span><span className="cx-dir-person"><strong>{c.name}</strong><small>{items.length} facture{items.length > 1 ? "s" : ""} · {c.phone || c.address || "Coordonnées à compléter"}</small></span>
          <span className="cx-dir-balance"><small>{a.refund > 0 && a.due === 0 ? "À restituer au client" : a.due ? "Reste à payer" : items.length ? "Compte soldé" : "Aucune facture"}</small><strong className={a.due ? "" : "cx-good-text"}>{money(a.due || a.refund)}</strong></span><ArrowRight size={18} className="cx-row-go" /></button>; })}
        {!list.length && <Empty title="Aucun client trouvé">Essayez un autre nom{role === "facturation" ? " ou ajoutez un client" : ""}.</Empty>}</div>
    </div>
    {form && <ClientForm client={form} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); nav({ name: "client", id: c.id }); }} />}
  </div>;
}

export function ClientAccount({ id, role, by, nav }: { id: string; role: Role; by: string; nav: Nav }) {
  const d = useData(), client = d.clients.find(c => c.id === id);
  const [edit, setEdit] = useState(false), [archive, setArchive] = useState(false), [pay, setPay] = useState<{ invoiceId: string; paymentId?: string } | null>(null), [cancel, setCancel] = useState<string | null>(null), [credit, setCredit] = useState<string | null>(null);
  if (!client) return <Empty title="Client introuvable." action={<Button onClick={() => nav({ name: "clients" })}>Tous les clients</Button>} />;
  const items = d.invoices.filter(i => i.client.id === client.id).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const a = accountTotals(items, d.payments, d.credits), unpaid = items.filter(i => balance(i, d.payments, d.credits).due > 0);
  const cashier = role === "encaissement", biller = role === "facturation";
  const entries = [
    ...items.filter(i => i.advance > 0).map(i => ({ id: `advance-${i.id}`, invoiceId: i.id, amount: i.advance, date: i.date, method: i.payment, reference: "Avance à l’émission", advance: true as const })),
    ...d.payments.filter(p => items.some(i => i.id === p.invoiceId)).map(p => ({ ...p, advance: false as const })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  const notes = d.credits.filter(c => items.some(i => i.id === c.invoiceId));
  return <div className="cx-page">
    <PageHead back={{ label: "Tous les clients", onClick: () => nav({ name: "clients" }) }} kicker="Compte client · tous les mois" title={<>{client.name}{client.archived && <span className="cx-chip cx-tone-neutral">Archivé</span>}</>}
      sub={[client.address, client.phone, client.email].filter(Boolean).join(" · ") || "Les coordonnées peuvent être complétées à tout moment."}
      actions={<>
        <Button kind="quiet" icon={<Pencil size={16} />} onClick={() => setEdit(true)}>Modifier les coordonnées</Button>
        {biller && (client.archived ? <Button kind="quiet" icon={<RotateCcw size={16} />} onClick={() => { commit(by, x => ({ clients: x.clients.map(c => c.id === client.id ? { ...c, archived: false, archivedAt: undefined } : c) }), { text: `Client ${client.name} réactivé`, clientId: client.id }); toast("Client réactivé."); }}>Réactiver le client</Button>
          : <Button kind="quiet" icon={<Archive size={16} />} onClick={() => setArchive(true)}>Archiver le client</Button>)}
        <Button icon={<Printer size={17} />} onClick={() => nav({ name: "situation", id: client.id })}>Imprimer la situation</Button>
        {biller && <Button kind="primary" icon={<FilePlus2 size={18} />} disabled={!!client.archived} title={client.archived ? "Réactivez le client pour créer une facture" : undefined} onClick={() => nav({ name: "compose", extra: client.id })}>Nouvelle facture</Button>}
      </>} />
    {client.archived && <p className="cx-archived-note">Client archivé le {dateFr(client.archivedAt ?? nowIso())}. Ses factures et paiements restent consultables.</p>}
    <div className="cx-account-summary">
      <div className={`cx-owes${a.due ? "" : " cx-settled"}`}><span>{a.due ? "Ce client vous doit" : "Aucun montant à recevoir"}</span><strong>{money(a.due)}</strong><small>{unpaid.length} facture{unpaid.length > 1 ? "s" : ""} à régler</small>
        {cashier && <Button kind="accent" icon={<Plus size={18} />} disabled={!unpaid.length} onClick={() => setPay({ invoiceId: unpaid[unpaid.length - 1].id })}>Enregistrer un paiement</Button>}</div>
      <div className="cx-account-numbers"><div><span>Total facturé</span><strong>{money(a.total)}</strong></div><div><span>Reçu, avances comprises</span><strong>{money(a.received)}</strong></div>{a.credited > 0 && <div><span>Avoirs émis</span><strong>− {money(a.credited)}</strong></div>}{a.refund > 0 && <div className="cx-refund"><span>À restituer au client</span><strong>{money(a.refund)}</strong></div>}
        <div className="cx-progress" aria-label="Part réglée"><span style={{ width: `${a.total ? Math.min(100, (a.received + a.credited) / a.total * 100) : 0}%` }} /></div></div>
    </div>
    <section className="cx-card cx-card-flush"><div className="cx-card-head"><h2>Factures</h2><span className="cx-muted">{items.length} au total</span></div>
      {items.length ? <div className="cx-table-wrap"><table className="cx-table"><thead><tr><th>Facture</th><th className="cx-num">Montant facturé</th><th className="cx-num">Reçu / Avoir</th><th className="cx-num">Reste à payer</th><th>Statut</th><th></th></tr></thead><tbody>
        {items.map(i => { const b = balance(i, d.payments, d.credits); return <tr key={i.id}>
          <td><button type="button" className="cx-doc-link" onClick={() => nav({ name: "invoice", id: i.id })}><FileText size={16} />{i.number}</button><small>{dateFr(i.date)}</small></td>
          <td className="cx-num">{money(b.total)}</td><td className="cx-num">{money(b.received)}{b.credited > 0 && <small>Avoir : {money(b.credited)}</small>}</td><td className="cx-num"><strong>{money(b.due)}</strong></td><td><StatusChip status={b.status} /></td>
          <td className="cx-row-actions">{cashier && b.due > 0 && <Button size="sm" kind="secondary" icon={<Plus size={14} />} onClick={() => setPay({ invoiceId: i.id })}>Ajouter un paiement</Button>}{b.refund > 0 && <span className="cx-muted">À restituer : {money(b.refund)}</span>}{biller && b.credited < b.total && <Button size="sm" kind="quiet" onClick={() => setCredit(i.id)}>Créer un avoir</Button>}</td>
        </tr>; })}</tbody></table></div>
        : <Empty title="Ce client n’a pas encore de facture" action={biller ? <Button kind="primary" onClick={() => nav({ name: "compose", extra: client.id })}>Créer sa première facture</Button> : undefined} />}
    </section>
    {notes.length > 0 && <section className="cx-card cx-card-flush"><div className="cx-card-head"><h2>Avoirs</h2></div><div className="cx-entry-list">{notes.map(c => <button type="button" className="cx-entry" key={c.id} onClick={() => nav({ name: "credit", id: c.id })}><span className="cx-entry-icon cx-entry-credit"><FileText size={17} /></span><span><strong>{c.number} · {money(c.amount)}</strong><small>{dateFr(c.date)} · facture {c.invoiceNumber} · {c.reason}</small></span><ArrowRight size={16} className="cx-row-go" /></button>)}</div></section>}
    <section className="cx-card cx-card-flush"><div className="cx-card-head"><h2>Paiements reçus</h2></div>
      <div className="cx-entry-list">{entries.map(p => <div className={`cx-entry${!p.advance && p.cancelledAt ? " cx-cancelled" : ""}`} key={p.id}>
        <span className="cx-entry-icon"><Wallet size={17} /></span>
        <div className="cx-entry-main"><strong>{money(p.amount)}{!p.advance && p.cancelledAt && <span className="cx-chip cx-tone-bad">Annulé</span>}</strong><p>{dateFr(p.date)} · {p.method} · {items.find(i => i.id === p.invoiceId)?.number}{!p.advance && p.by && <> · saisi par {accountName(p.by)}</>}</p>{p.reference && <small>{p.reference}</small>}
          {!p.advance && p.history?.length ? <details className="cx-revisions"><summary>{p.history.length} correction{p.history.length > 1 ? "s" : ""} · voir les anciennes valeurs</summary>{p.history.map((v, k) => <p key={k}>{money(v.amount)} · {dateFr(v.date)} · {v.method}{v.reference ? " · " + v.reference : ""} <em>(remplacé le {dateFr(v.savedAt)})</em></p>)}</details> : null}</div>
        <div className="cx-entry-actions">
          {p.advance ? <><span className="cx-chip cx-tone-info">Avance</span>{biller && <Button size="sm" kind="quiet" icon={<Pencil size={14} />} disabled={d.closedMonths.includes(p.date.slice(0, 7))} onClick={() => nav({ name: "compose", id: p.invoiceId })}>Modifier l’avance</Button>}</>
            : p.cancelledAt ? null : p.lockedAt ? <LockBadge /> : cashier ? <><Button size="sm" kind="quiet" icon={<Pencil size={14} />} onClick={() => setPay({ invoiceId: p.invoiceId, paymentId: p.id })}>Modifier</Button><Button size="sm" kind="quiet" onClick={() => setCancel(p.id)}>Annuler une erreur</Button></> : <span className="cx-chip cx-tone-warn">En attente de validation</span>}
        </div>
      </div>)}{!entries.length && <Empty icon={<Wallet size={22} />} title="Aucun paiement enregistré" />}</div>
    </section>
    {edit && <ClientForm client={client} by={by} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
    {archive && <Confirm title="Archiver ce client ?" confirm="Archiver le client" cancel="Garder le client" onClose={() => setArchive(false)} onConfirm={() => { commit(by, x => ({ clients: x.clients.map(c => c.id === client.id ? { ...c, archived: true, archivedAt: nowIso() } : c) }), { text: `Client ${client.name} archivé`, clientId: client.id }); setArchive(false); toast("Client archivé. Son historique est conservé dans les clients archivés."); }}>
      <p><strong>{client.name}</strong> quittera la liste des clients actifs. Rien n’est supprimé : ses factures, avoirs et paiements restent consultables, et il peut être réactivé à tout moment.</p></Confirm>}
    {pay && <PaymentModal invoiceId={pay.invoiceId} paymentId={pay.paymentId} by={by} onClose={() => setPay(null)} />}
    {cancel && <CancelPayment payment={d.payments.find(p => p.id === cancel)!} by={by} onClose={() => setCancel(null)} />}
    {credit && <CreditModal invoiceId={credit} by={by} onClose={() => setCredit(null)} onIssued={cid => { setCredit(null); nav({ name: "credit", id: cid }); }} />}
  </div>;
}
