import { useState } from "react";
import { FilePlus2, Lock, Pencil, Plus, UserPlus } from "lucide-react";
import { Button, Confirm, Empty, Field, Modal, MoreMenu, PageHead, SearchBox, StatusChip, TextInput, matches, toast } from "./ui";
import { CancelPayment, CreditModal, PaymentModal } from "./payments";
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
    toast(isNew ? `Client « ${clean.name} » ajouté.` : "Coordonnées enregistrées.");
    onSaved(clean);
  }
  const fields: [keyof Client, string, string?][] = [["contact", "Personne à contacter"], ["phone", "Téléphone", "+237 6…"], ["email", "E-mail"], ["address", "Adresse"], ["niu", "NIU"], ["rc", "RCCM"]];
  return <Modal title={isNew ? "Ajouter un client" : `Modifier ${client.name}`} subtitle="Seul le nom est obligatoire. Ce qui est vide n’est pas imprimé." onClose={onClose}
    actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={save}>{isNew ? "Ajouter le client" : "Enregistrer"}</Button></>}>
    <form className="cx-form-grid" onSubmit={e => { e.preventDefault(); save(); }}>
      <Field label="Nom du client" required error={nameError} wide><TextInput value={c.name} onChange={set("name")} autoFocus placeholder="Ex. EFMK SARL…" /></Field>
      {fields.map(([k, label, ph]) => <Field key={k} label={label} optional wide={k === "address"}><TextInput value={String(c[k] ?? "")} onChange={set(k)} placeholder={ph} inputMode={k === "phone" ? "tel" : k === "email" ? "email" : undefined} /></Field>)}
      <button type="submit" hidden />
    </form>
    {!isNew && <p className="cx-muted">Les factures déjà émises gardent les coordonnées imprimées.</p>}
  </Modal>;
}

export function ClientsDirectory({ role, by, nav }: { role: Role; by: string; nav: Nav }) {
  const d = useData(), [q, setQ] = useState(""), [filter, setFilter] = useState<"all" | "due" | "archived">("all"), [form, setForm] = useState<Client | null>(null);
  const archivedCount = d.clients.filter(c => c.archived).length;
  const rows = d.clients.filter(c => filter === "archived" ? c.archived : !c.archived).map(c => { const items = d.invoices.filter(i => i.client.id === c.id); return { c, items, a: accountTotals(items, d.payments, d.credits) }; })
    .filter(r => matches(q, r.c.name, r.c.phone, r.c.contact, r.c.niu) && (filter !== "due" || r.a.due > 0)).sort((a, b) => a.c.name.localeCompare(b.c.name));
  return <div className="cx-page">
    <PageHead title={role === "encaissement" ? "Clients et paiements" : "Clients"} sub={role === "encaissement" ? "Ouvrez le client qui a payé pour enregistrer son paiement." : undefined}
      actions={role === "facturation" ? <Button kind="primary" icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => setForm({ id: "", name: "", contact: "", address: "", phone: "", email: "", niu: "", rc: "" })}>Ajouter un client</Button> : undefined} />
    <div className="cx-toolbar">
      <SearchBox value={q} onChange={setQ} placeholder="Chercher un client…" />
      <div className="cx-tabs" role="tablist" aria-label="Filtrer les clients">
        <button role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>Tous</button>
        <button role="tab" aria-selected={filter === "due"} onClick={() => setFilter("due")}>Avec un reste à payer</button>
        {archivedCount > 0 && <button role="tab" aria-selected={filter === "archived"} onClick={() => setFilter("archived")}>Archivés <span>{archivedCount}</span></button>}
      </div>
    </div>
    <section className="cx-panel cx-list">{rows.map(({ c, items, a }) => <button type="button" className="cx-list-row" key={c.id} onClick={() => nav({ name: "client", id: c.id })}>
      <span className="cx-list-main"><strong>{c.name}</strong><small>{items.length} facture{items.length > 1 ? "s" : ""}{c.phone ? `, ${c.phone}` : ""}</small></span>
      <span className="cx-list-amount">{a.refund > 0 && !a.due ? <><small>À rendre</small><strong>{money(a.refund)}</strong></> : a.due ? <><small>Reste à payer</small><strong>{money(a.due)}</strong></> : <small className="cx-good-text">{items.length ? "Tout est payé" : "Aucune facture"}</small>}</span>
    </button>)}{!rows.length && <Empty title="Aucun client trouvé.">{q ? "Vérifiez l’orthographe du nom." : null}</Empty>}</section>
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
    ...items.filter(i => i.advance > 0).map(i => ({ id: `advance-${i.id}`, invoiceId: i.id, amount: i.advance, date: i.date, method: i.payment, reference: "Avance à la facturation", advance: true as const })),
    ...d.payments.filter(p => items.some(i => i.id === p.invoiceId)).map(p => ({ ...p, advance: false as const })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  const notes = d.credits.filter(c => items.some(i => i.id === c.invoiceId));
  const contact = [client.contact, client.phone, client.email, client.address].filter(Boolean).join(", ");
  return <div className="cx-page">
    <PageHead back={{ label: "Clients", onClick: () => nav({ name: "clients" }) }} title={<>{client.name}{client.archived && <span className="cx-chip">Archivé</span>}</>} sub={contact || "Coordonnées à compléter"}
      actions={biller ? <>
        <MoreMenu label="Autres actions" items={[client.archived ? { label: "Réactiver le client", onClick: () => { commit(by, x => ({ clients: x.clients.map(c => c.id === client.id ? { ...c, archived: false, archivedAt: undefined } : c) }), { text: `Client ${client.name} réactivé`, clientId: client.id }); toast("Client réactivé."); } } : { label: "Archiver le client", hint: "Il quitte la liste. Rien n’est supprimé.", onClick: () => setArchive(true) }]} />
        <Button icon={<Pencil size={17} aria-hidden="true" />} onClick={() => setEdit(true)}>Modifier</Button>
        <Button kind="primary" icon={<FilePlus2 size={18} aria-hidden="true" />} disabled={!!client.archived} title={client.archived ? "Réactivez le client pour le facturer" : undefined} onClick={() => nav({ name: "compose", extra: client.id })}>Nouvelle facture</Button>
      </> : <>
        <Button onClick={() => nav({ name: "situation", id: client.id })}>Relevé du client</Button>
        <Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} disabled={!unpaid.length} onClick={() => setPay({ invoiceId: unpaid[unpaid.length - 1].id })}>Enregistrer un paiement</Button>
      </>} />
    <dl className="cx-facts">
      <div><dt>Facturé</dt><dd>{money(a.total)}</dd></div>
      <div><dt>Reçu</dt><dd>{money(a.received)}</dd></div>
      {a.credited > 0 && <div><dt>Avoirs</dt><dd>− {money(a.credited)}</dd></div>}
      <div><dt>{a.refund > 0 && !a.due ? "À rendre au client" : "Reste à payer"}</dt><dd className="cx-strong">{money(a.refund > 0 && !a.due ? a.refund : a.due)}</dd></div>
    </dl>
    <section className="cx-section"><div className="cx-section-head"><h2>Factures</h2></div>
      <div className="cx-panel">{items.length ? <table className="cx-table"><thead><tr><th>Facture</th><th>Date</th><th className="cx-num">Montant</th><th className="cx-num">Reste à payer</th><th>Paiement</th>{cashier && <th><span className="cx-sr">Action</span></th>}</tr></thead><tbody>
        {items.map(i => { const b = balance(i, d.payments, d.credits); return <tr key={i.id} className="cx-clickable" onClick={() => nav({ name: "invoice", id: i.id })}>
          <td><button type="button" className="cx-doc-link" onClick={e => { e.stopPropagation(); nav({ name: "invoice", id: i.id }); }}>{i.number}</button></td><td>{dateFr(i.date)}</td><td className="cx-num">{money(b.total)}</td><td className="cx-num">{money(b.due)}</td><td><StatusChip status={b.status} /></td>
          {cashier && <td className="cx-num">{b.due > 0 && <Button size="sm" onClick={() => setPay({ invoiceId: i.id })}>Encaisser</Button>}</td>}</tr>; })}
      </tbody></table> : <Empty title="Aucune facture pour ce client." action={biller ? <Button kind="primary" onClick={() => nav({ name: "compose", extra: client.id })}>Créer sa première facture</Button> : undefined} />}</div>
    </section>
    {notes.length > 0 && <section className="cx-section"><div className="cx-section-head"><h2>Avoirs</h2></div><div className="cx-panel cx-list">{notes.map(c => <button type="button" className="cx-list-row" key={c.id} onClick={() => nav({ name: "credit", id: c.id })}><span className="cx-list-main"><strong>{c.number}</strong><small>{dateFr(c.date)}, sur la facture {c.invoiceNumber}. {c.reason}</small></span><span className="cx-list-amount"><strong>− {money(c.amount)}</strong></span></button>)}</div></section>}
    <section className="cx-section"><div className="cx-section-head"><h2>Paiements reçus</h2>{biller && <p>Les paiements sont saisis par l’encaissement.</p>}</div>
      <div className="cx-panel cx-list">{entries.map(p => <div className={`cx-list-row cx-static${!p.advance && p.cancelledAt ? " cx-cancelled" : ""}`} key={p.id}>
        <span className="cx-list-main"><strong>{money(p.amount)}, {p.method}</strong><small>{dateFr(p.date)}, facture {items.find(i => i.id === p.invoiceId)?.number}{p.reference ? `. ${p.reference}` : ""}{!p.advance && p.by ? `. Saisi par ${accountName(p.by)}` : ""}</small>
          {!p.advance && p.history?.length ? <details className="cx-revisions"><summary>Corrigé {p.history.length} fois</summary>{p.history.map((v, k) => <p key={k}>Avant : {money(v.amount)}, {v.method}, {dateFr(v.date)}</p>)}</details> : null}</span>
        <span className="cx-list-actions">{p.advance ? <span className="cx-muted">Avance</span>
          : p.cancelledAt ? <span className="cx-chip cx-tone-bad">Annulé</span>
          : p.lockedAt ? <span className="cx-chip cx-tone-good"><Lock size={12} aria-hidden="true" />Validé</span>
          : cashier ? <><button type="button" className="cx-text-btn" onClick={() => setPay({ invoiceId: p.invoiceId, paymentId: p.id })}>Corriger</button><button type="button" className="cx-text-btn" onClick={() => setCancel(p.id)}>Annuler</button></>
          : <span className="cx-muted">En attente de validation</span>}</span>
      </div>)}{!entries.length && <Empty title="Aucun paiement reçu pour l’instant." />}</div>
    </section>
    {edit && <ClientForm client={client} by={by} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
    {archive && <Confirm title={`Archiver ${client.name} ?`} confirm="Archiver le client" cancel="Garder le client" onClose={() => setArchive(false)} onConfirm={() => { commit(by, x => ({ clients: x.clients.map(c => c.id === client.id ? { ...c, archived: true, archivedAt: nowIso() } : c) }), { text: `Client ${client.name} archivé`, clientId: client.id }); setArchive(false); toast("Client archivé. Il reste dans « Archivés »."); }}>
      <p>Le client quitte la liste des clients actifs. Rien n’est supprimé : ses factures et ses paiements restent consultables, et vous pouvez le réactiver à tout moment.</p></Confirm>}
    {pay && <PaymentModal invoiceId={pay.invoiceId} paymentId={pay.paymentId} by={by} onClose={() => setPay(null)} />}
    {cancel && <CancelPayment payment={d.payments.find(p => p.id === cancel)!} by={by} onClose={() => setCancel(null)} />}
    {credit && <CreditModal invoiceId={credit} by={by} onClose={() => setCredit(null)} onIssued={cid => { setCredit(null); nav({ name: "credit", id: cid }); }} />}
  </div>;
}
