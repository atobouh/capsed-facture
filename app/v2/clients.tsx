import { useState } from "react";
import { FilePlus2, Lock, Pencil, Plus, UserPlus } from "lucide-react";
import { Button, Confirm, Empty, Field, Modal, MoreMenu, Monogram, PageHead, Row, SearchBox, Stamp, StatusChip, TextInput, matches, toast, useWide } from "./ui";
import { CancelPayment, CreditModal, PaymentModal } from "./payments";
import { ImportClients } from "./import-clients";
import { DeleteDialog, useCanDelete } from "./corbeille";
import type { BinTarget } from "./corbeille";
import { accountName, methodName, accountTotals, balance, canBill, canCash, commit, dateFr, getData, overdueDays, money, nowIso, uid, useData } from "./store";
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
  return <Modal side title={isNew ? "Ajouter un client" : `Modifier ${client.name}`} subtitle="Seul le nom est obligatoire. Ce qui est vide n’est pas imprimé." onClose={onClose}
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
  const d = useData(), wide = useWide(), [q, setQ] = useState(""), [form, setForm] = useState<Client | null>(null), [sel, setSel] = useState<string | null>(null), [importing, setImporting] = useState(false);
  const rows = d.clients.map(c => { const items = d.invoices.filter(i => i.client.id === c.id), open = items.filter(i => balance(i, d.payments, d.credits).due > 0); return { c, items, open, late: open.length ? Math.max(...open.map(overdueDays)) : 0, a: accountTotals(items, d.payments, d.credits) }; })
    .filter(r => matches(q, r.c.name, r.c.phone, r.c.contact, r.c.niu)).sort((a, b) => b.a.due - a.a.due || a.c.name.localeCompare(b.c.name));
  const owing = rows.filter(r => !r.c.archived && (r.a.due > 0 || r.a.refund > 0)), settled = rows.filter(r => !r.c.archived && !r.a.due && !r.a.refund), archived = rows.filter(r => r.c.archived);
  const current = rows.find(r => r.c.id === sel)?.c.id ?? (wide ? (owing[0] ?? settled[0] ?? archived[0])?.c.id : undefined);
  const open = (id: string) => wide ? setSel(id) : nav({ name: "client", id });
  const row = ({ c, items, open: unpaid, late, a }: typeof rows[number]) => <Row key={c.id} current={wide && current === c.id} onClick={() => open(c.id)} lead={<Monogram name={c.name} />} title={c.name}
    sub={<><span>{unpaid.length ? `${unpaid.length} facture${unpaid.length > 1 ? "s" : ""} à payer` : items.length ? `${items.length} facture${items.length > 1 ? "s" : ""}, tout est payé` : "Aucune facture"}</span>{late > 0 && <span className="cx-bad-text">{late} j de retard</span>}</>}
    amount={a.due ? money(a.due) : a.refund ? `${money(a.refund)} à rendre` : undefined} />;
  const list = <>
    <div className="cx-list-cap">{canCash(role) ? "Avec un reste à payer" : "Clients"} · {owing.length}</div>
    {owing.length ? <div className="cx-rows" role="list">{owing.map(row)}</div> : <p className="cx-fold-note">{q ? "Aucun client ne correspond." : "Aucun client n’a de reste à payer."}</p>}
    {settled.length > 0 && <details className="cx-fold" open={!!q && !owing.length}><summary><span>Tout payé <em>({settled.length})</em></span></summary><div className="cx-rows" role="list">{settled.map(row)}</div></details>}
    {archived.length > 0 && <details className="cx-fold" open={!!q && !owing.length && !settled.length}><summary><span>Clients archivés <em>({archived.length})</em></span></summary><div className="cx-rows" role="list">{archived.map(row)}</div></details>}
  </>;
  return <div className={`cx-page${wide ? " cx-page-split" : ""}`}>
    <PageHead title={canCash(role) ? "Clients et paiements" : "Clients"} tools={<SearchBox value={q} onChange={setQ} placeholder="Chercher un client" />}
      actions={canBill(role) ? <><MoreMenu iconOnly label="Autres actions" items={[{ label: "Importer des clients", hint: "Depuis un fichier Excel ou CSV", onClick: () => setImporting(true) }]} /><Button kind="primary" icon={<UserPlus size={16} aria-hidden="true" />} onClick={() => setForm({ id: "", name: "", contact: "", address: "", phone: "", email: "", niu: "", rc: "" })}>Ajouter un client</Button></> : undefined} />
    {importing && <ImportClients by={by} onClose={() => setImporting(false)} />}
    {wide ? <div className="cx-split cx-split-list"><section className="cx-card cx-card-flush cx-scroll" aria-label="Clients">{list}</section><section className="cx-scroll cx-detail-col" aria-label="Compte du client">{current ? <ClientAccount key={current} id={current} role={role} by={by} nav={nav} pane /> : <Empty title="Choisissez un client dans la liste." />}</section></div>
      : <section className="cx-card cx-card-flush">{list}</section>}
    {form && <ClientForm client={form} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); open(c.id); }} />}
  </div>;
}

export function ClientAccount({ id, role, by, nav, pane }: { id: string; role: Role; by: string; nav: Nav; pane?: boolean }) {
  const d = useData(), client = d.clients.find(c => c.id === id);
  const [edit, setEdit] = useState(false), [archive, setArchive] = useState(false), [pay, setPay] = useState<{ invoiceId: string; paymentId?: string } | null>(null), [cancel, setCancel] = useState<string | null>(null), [credit, setCredit] = useState<string | null>(null);
  const canDelete = useCanDelete(), [del, setDel] = useState<BinTarget | null>(null);
  if (!client) return <Empty title="Client introuvable." action={<Button onClick={() => nav({ name: "clients" })}>Tous les clients</Button>} />;
  const items = d.invoices.filter(i => i.client.id === client.id).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const a = accountTotals(items, d.payments, d.credits), unpaid = items.filter(i => balance(i, d.payments, d.credits).due > 0);
  const cashier = canCash(role), biller = canBill(role);
  const entries = [
    ...items.filter(i => i.advance > 0).map(i => ({ id: `advance-${i.id}`, invoiceId: i.id, amount: i.advance, date: i.date, method: i.payment, reference: "Avance à la facturation", advance: true as const })),
    ...d.payments.filter(p => items.some(i => i.id === p.invoiceId)).map(p => ({ ...p, advance: false as const })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  const notes = d.credits.filter(c => items.some(i => i.id === c.invoiceId));
  const contact = [client.contact, client.phone, client.email, client.address].filter(Boolean).join(", ");
  return <div className={pane ? "cx-detail" : "cx-page"}>
    <PageHead pane={pane} back={pane ? undefined : { label: "Clients", onClick: () => nav({ name: "clients" }) }} title={<>{client.name}{client.archived && <span className="cx-chip">Archivé</span>}</>} sub={contact || "Coordonnées à compléter"}
      actions={<>
        {biller && <MoreMenu label="Autres actions" items={[
          ...(cashier ? [{ label: "Modifier les coordonnées", onClick: () => setEdit(true) }, { label: "Relevé du client", onClick: () => nav({ name: "situation", id: client.id }) }] : []),
          ...(canDelete ? [{ label: "Supprimer le client", hint: "Restaurable sur le site de la Direction", onClick: () => setDel({ collection: "clients", id: client.id }) }] : []),
          client.archived ? { label: "Réactiver le client", onClick: () => { commit(by, x => ({ clients: x.clients.map(c => c.id === client.id ? { ...c, archived: false, archivedAt: undefined } : c) }), { text: `Client ${client.name} réactivé`, clientId: client.id }); toast("Client réactivé."); } } : { label: "Archiver le client", hint: "Il quitte la liste. Rien n’est supprimé.", onClick: () => setArchive(true) }]} />}
        {biller && !cashier && <Button icon={<Pencil size={17} aria-hidden="true" />} onClick={() => setEdit(true)}>Modifier</Button>}
        {cashier && !biller && <Button onClick={() => nav({ name: "situation", id: client.id })}>Relevé du client</Button>}
        {biller && <Button kind={cashier ? "secondary" : "primary"} icon={<FilePlus2 size={18} aria-hidden="true" />} disabled={!!client.archived} title={client.archived ? "Réactivez le client pour le facturer" : undefined} onClick={() => nav({ name: "compose", extra: client.id })}>Nouvelle facture</Button>}
        {cashier && <Button kind="primary" icon={<Plus size={18} aria-hidden="true" />} disabled={!unpaid.length} onClick={() => setPay({ invoiceId: unpaid[unpaid.length - 1].id })}>Enregistrer un paiement</Button>}
      </>} />
    <dl className="cx-strip">
      <div><dt>Facturé</dt><dd>{money(a.total)}</dd></div>
      <div><dt>Encaissé</dt><dd>{money(a.received)}</dd></div>
      {a.credited > 0 && <div><dt>Avoirs</dt><dd>− {money(a.credited)}</dd></div>}
      <div><dt>{a.refund > 0 && !a.due ? "À rendre au client" : "Reste à payer"}</dt><dd className="cx-strong">{money(a.refund > 0 && !a.due ? a.refund : a.due)}</dd></div>
    </dl>
    <section className="cx-card cx-card-flush"><h2 className="cx-card-title">Factures</h2>
      {items.length ? <table className="cx-table"><thead><tr><th>Numéro</th><th>Date</th><th className="cx-num cx-hide-700">Montant</th><th className="cx-num">Reste à payer</th><th>Paiement</th>{cashier && <th><span className="cx-sr">Action</span></th>}</tr></thead><tbody>
        {items.map(i => { const b = balance(i, d.payments, d.credits); return <tr key={i.id} className="cx-clickable" onClick={() => nav({ name: "invoice", id: i.id })}>
          <td className="t-n"><button type="button" className="cx-doc-link" onClick={e => { e.stopPropagation(); nav({ name: "invoice", id: i.id }); }}>{i.number}</button></td><td className="t-d" data-label="Date">{dateFr(i.date)}</td><td className="cx-num t-x cx-hide-700" data-label="Montant">{money(b.total)}</td><td className="cx-num cx-t-amount t-a" data-label="Reste à payer">{money(b.due)}</td><td className="t-s" data-label="Paiement"><StatusChip status={b.status} /></td>
          {cashier && <td className="cx-num t-act" onClick={e => e.stopPropagation()}>{b.due > 0 && <Button size="sm" onClick={() => setPay({ invoiceId: i.id })}>Encaisser</Button>}</td>}</tr>; })}
      </tbody></table> : <Empty title="Aucune facture pour ce client." action={biller ? <Button kind="primary" onClick={() => nav({ name: "compose", extra: client.id })}>Créer sa première facture</Button> : undefined} />}
    </section>
    {notes.length > 0 && <section className="cx-card cx-card-flush"><h2 className="cx-card-title">Avoirs</h2><div className="cx-list">{notes.map(c => <button type="button" className="cx-list-row" key={c.id} onClick={() => nav({ name: "credit", id: c.id })}><span className="cx-list-main"><strong>{c.number}</strong><small>{dateFr(c.date)}, sur la facture {c.invoiceNumber}. {c.reason}</small></span><span className="cx-list-amount"><strong>− {money(c.amount)}</strong></span></button>)}</div></section>}
    <section className="cx-card cx-card-flush"><h2 className="cx-card-title">Paiements reçus{biller && !cashier && <small>Saisis par l’encaissement</small>}</h2>
      <div className="cx-list">{entries.map(p => <div className={`cx-list-row cx-static${!p.advance && p.cancelledAt ? " cx-cancelled" : ""}`} key={p.id}>
        <span className="cx-list-main"><strong>{money(p.amount)}, {methodName(p.method)}</strong><small>{dateFr(p.date)}, facture {items.find(i => i.id === p.invoiceId)?.number}{p.reference ? `. ${p.reference}` : ""}{!p.advance && p.by ? `. Saisi par ${accountName(p.by)}` : ""}</small>
          {!p.advance && p.history?.length ? <details className="cx-revisions"><summary>Corrigé {p.history.length} fois</summary>{p.history.map((v, k) => <p key={k}>Avant : {money(v.amount)}, {methodName(v.method)}, {dateFr(v.date)}</p>)}</details> : null}</span>
        <span className="cx-list-actions">{p.advance ? <span className="cx-muted">Avance</span>
          : p.cancelledAt ? <Stamp tone="bad">Annulé</Stamp>
          : p.lockedAt ? <Stamp tone="good"><Lock size={12} aria-hidden="true" />Validé par la Direction</Stamp>
          : cashier ? <><span className="cx-chip">À valider par la Direction</span><button type="button" className="cx-text-btn" onClick={() => setPay({ invoiceId: p.invoiceId, paymentId: p.id })}>Corriger</button><button type="button" className="cx-text-btn cx-text-bad" onClick={() => setCancel(p.id)}>Annuler</button></>
          : <span className="cx-chip">À valider par la Direction</span>}
          {canDelete && !p.advance && <button type="button" className="cx-text-btn cx-text-bad" onClick={() => setDel({ collection: "payments", id: p.id })}>Supprimer</button>}</span>
      </div>)}{!entries.length && <Empty title="Aucun paiement reçu pour l’instant." />}</div>
    </section>
    {edit && <ClientForm client={client} by={by} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />}
    {archive && <Confirm title={`Archiver ${client.name} ?`} confirm="Archiver le client" cancel="Garder le client" onClose={() => setArchive(false)} onConfirm={() => { commit(by, x => ({ clients: x.clients.map(c => c.id === client.id ? { ...c, archived: true, archivedAt: nowIso() } : c) }), { text: `Client ${client.name} archivé`, clientId: client.id }); setArchive(false); toast("Client archivé. Il reste dans « Archivés »."); }}>
      <p>Le client quitte la liste des clients actifs. Rien n’est supprimé : ses factures et ses paiements restent consultables, et vous pouvez le réactiver à tout moment.</p></Confirm>}
    {pay && <PaymentModal invoiceId={pay.invoiceId} paymentId={pay.paymentId} by={by} onClose={() => setPay(null)} />}
    {cancel && <CancelPayment payment={d.payments.find(p => p.id === cancel)!} by={by} onClose={() => setCancel(null)} />}
    {credit && <CreditModal invoiceId={credit} by={by} onClose={() => setCredit(null)} onIssued={cid => { setCredit(null); nav({ name: "credit", id: cid }); }} />}
    {del && <DeleteDialog target={del} by={by} onClose={() => setDel(null)} onDone={del.collection === "clients" ? () => nav({ name: "clients" }) : undefined} />}
  </div>;
}
