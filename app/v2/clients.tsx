import { useState } from "react";
import { FilePlus2, Lock, Pencil, Plus, UserPlus } from "lucide-react";
import { Button, Confirm, Empty, Field, Modal, MoreMenu, Monogram, PageHead, Row, SearchBox, Stamp, StatusChip, TextInput, matches, toast, useWide } from "./ui";
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
  const d = useData(), wide = useWide(), [q, setQ] = useState(""), [form, setForm] = useState<Client | null>(null), [sel, setSel] = useState<string | null>(null);
  const rows = d.clients.map(c => { const items = d.invoices.filter(i => i.client.id === c.id); return { c, items, a: accountTotals(items, d.payments, d.credits) }; })
    .filter(r => matches(q, r.c.name, r.c.phone, r.c.contact, r.c.niu)).sort((a, b) => b.a.due - a.a.due || a.c.name.localeCompare(b.c.name));
  const active = rows.filter(r => !r.c.archived), archived = rows.filter(r => r.c.archived);
  const current = rows.find(r => r.c.id === sel)?.c.id ?? (wide ? active[0]?.c.id ?? archived[0]?.c.id : undefined);
  const open = (id: string) => wide ? setSel(id) : nav({ name: "client", id });
  const row = ({ c, items, a }: typeof rows[number]) => <Row key={c.id} current={wide && current === c.id} onClick={() => open(c.id)} lead={<Monogram name={c.name} />} title={c.name}
    sub={<span>{items.length ? `${items.length} facture${items.length > 1 ? "s" : ""}` : "Aucune facture"}</span>}
    amount={a.due ? money(a.due) : a.refund ? `${money(a.refund)} à rendre` : undefined} state={a.due ? <span className="cx-row-label">reste à payer</span> : items.length && !a.refund ? <Stamp tone="good">Tout payé</Stamp> : undefined} />;
  const list = <>
    {active.length ? <div className="cx-rows" role="list">{active.map(row)}</div> : <Empty title="Aucun client trouvé.">{q ? "Vérifiez l’orthographe du nom." : null}</Empty>}
    {archived.length > 0 && <details className="cx-list-more" open={!!q && !active.length}><summary>Clients archivés ({archived.length})</summary><div className="cx-rows" role="list">{archived.map(row)}</div></details>}
  </>;
  return <div className={`cx-page${wide ? " cx-page-split" : ""}`}>
    <PageHead title={role === "encaissement" ? "Clients et paiements" : "Clients"} sub={role === "encaissement" ? "Choisissez le client qui a payé, puis enregistrez son paiement." : undefined}
      actions={role === "facturation" ? <Button kind="primary" icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => setForm({ id: "", name: "", contact: "", address: "", phone: "", email: "", niu: "", rc: "" })}>Ajouter un client</Button> : undefined} />
    <div className="cx-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Chercher un client…" /></div>
    {wide ? <div className="cx-split"><section className="cx-pane-list" aria-label="Clients">{list}</section><section className="cx-pane-detail" aria-label="Compte du client">{current ? <ClientAccount key={current} id={current} role={role} by={by} nav={nav} pane /> : <Empty title="Choisissez un client dans la liste." />}</section></div>
      : <section className="cx-panel">{list}</section>}
    {form && <ClientForm client={form} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); open(c.id); }} />}
  </div>;
}

export function ClientAccount({ id, role, by, nav, pane }: { id: string; role: Role; by: string; nav: Nav; pane?: boolean }) {
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
  return <div className={pane ? "cx-detail" : "cx-page"}>
    <PageHead pane={pane} back={pane ? undefined : { label: "Clients", onClick: () => nav({ name: "clients" }) }} title={<>{client.name}{client.archived && <span className="cx-chip">Archivé</span>}</>} sub={contact || "Coordonnées à compléter"}
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
      <div className="cx-panel">{items.length ? <div className="cx-rows" role="list">{items.map(i => { const b = balance(i, d.payments, d.credits); return <div className="cx-row-wrap" key={i.id}>
          <Row onClick={() => nav({ name: "invoice", id: i.id })} title={<>Facture <span className="cx-nowrap">{i.number}</span></>} sub={<><span>{dateFr(i.date)}</span><span>Montant {money(b.total)}</span></>}
            amount={b.due > 0 ? money(b.due) : undefined} state={b.due > 0 ? <span className="cx-row-label">reste à payer</span> : <StatusChip status={b.status} />} />
          {cashier && b.due > 0 && <Button size="sm" kind="secondary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setPay({ invoiceId: i.id })}>Encaisser</Button>}
        </div>; })}</div> : <Empty title="Aucune facture pour ce client." action={biller ? <Button kind="primary" onClick={() => nav({ name: "compose", extra: client.id })}>Créer sa première facture</Button> : undefined} />}</div>
    </section>
    {notes.length > 0 && <section className="cx-section"><div className="cx-section-head"><h2>Avoirs</h2></div><div className="cx-panel cx-list">{notes.map(c => <button type="button" className="cx-list-row" key={c.id} onClick={() => nav({ name: "credit", id: c.id })}><span className="cx-list-main"><strong>{c.number}</strong><small>{dateFr(c.date)}, sur la facture {c.invoiceNumber}. {c.reason}</small></span><span className="cx-list-amount"><strong>− {money(c.amount)}</strong></span></button>)}</div></section>}
    <section className="cx-section"><div className="cx-section-head"><h2>Paiements reçus</h2>{biller && <p>Les paiements sont saisis par l’encaissement.</p>}</div>
      <div className="cx-panel cx-list">{entries.map(p => <div className={`cx-list-row cx-static${!p.advance && p.cancelledAt ? " cx-cancelled" : ""}`} key={p.id}>
        <span className="cx-list-main"><strong>{money(p.amount)}, {p.method}</strong><small>{dateFr(p.date)}, facture {items.find(i => i.id === p.invoiceId)?.number}{p.reference ? `. ${p.reference}` : ""}{!p.advance && p.by ? `. Saisi par ${accountName(p.by)}` : ""}</small>
          {!p.advance && p.history?.length ? <details className="cx-revisions"><summary>Corrigé {p.history.length} fois</summary>{p.history.map((v, k) => <p key={k}>Avant : {money(v.amount)}, {v.method}, {dateFr(v.date)}</p>)}</details> : null}</span>
        <span className="cx-list-actions">{p.advance ? <span className="cx-muted">Avance</span>
          : p.cancelledAt ? <Stamp tone="bad">Annulé</Stamp>
          : p.lockedAt ? <Stamp tone="plum"><Lock size={13} aria-hidden="true" />Validé</Stamp>
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
