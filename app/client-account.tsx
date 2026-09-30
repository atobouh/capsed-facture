import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Search, Wallet, FileText, Pencil } from "lucide-react";
import { formatMoney as money } from "./document-model";

export type Payment = { id: string; invoiceId: string; amount: number; date: string; method: string; reference: string; cancelledAt?: string };
type AccountInvoice = { id: string; number: string; date: string; client: { id: string; name: string }; lines: { quantity: number; unitPrice: number }[]; taxRate: number; advance: number; payment: string };
type AccountClient = { id: string; name: string; address: string; phone: string; email: string };
type CreditEntry = { id: string; invoiceId: string; number: string; date: string; amount: number; reason: string };
export function balance(i: AccountInvoice, payments: Payment[], credits: CreditEntry[] = []) {
  const ht = i.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = Math.round(ht + Math.round(ht * i.taxRate / 100));
  const received = i.advance + payments.filter(p => p.invoiceId === i.id && !p.cancelledAt).reduce((s, p) => s + p.amount, 0);
  const credited = credits.filter(c => c.invoiceId === i.id).reduce((s, c) => s + c.amount, 0);
  const net = Math.max(0, total - credited);
  const due = Math.max(0, net - received), refund = Math.max(0, received - net);
  return { total, received, credited, net, due, refund, status: refund > 0 ? "À rembourser" : due === 0 ? credited > 0 ? "Soldée avec avoir" : "Payée" : received > 0 || credited > 0 ? "Partiellement réglée" : "À payer" };
}
export function PaymentStatus({ invoice, payments, credits = [] }: { invoice: AccountInvoice; payments: Payment[]; credits?: CreditEntry[] }) {
  const b = balance(invoice, payments, credits);
  return <span className={`payment-status ${b.refund > 0 ? "partial" : b.due === 0 ? "paid" : b.received > 0 || b.credited > 0 ? "partial" : "unpaid"}`}>{b.due === 0 && b.refund === 0 && <Check size={13} />}{b.status}</span>;
}
function account(items: AccountInvoice[], payments: Payment[], credits: CreditEntry[] = []) {
  return items.reduce((s, i) => { const b = balance(i, payments, credits); return { total: s.total + b.total, received: s.received + b.received, due: s.due + b.due, credited: s.credited + b.credited, refund: s.refund + b.refund }; }, { total: 0, received: 0, due: 0, credited: 0, refund: 0 });
}
const date = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function ClientAccount({ clients, invoices, payments, credits, onCredit, onCreditOpen, clientId, onClient, onBack, onAdd, onEdit, onInvoice, onNewInvoice, onPayment, onCancel }: {
  clients: AccountClient[]; invoices: AccountInvoice[]; payments: Payment[]; credits: CreditEntry[]; onCredit: (id: string) => void; onCreditOpen: (id: string) => void; clientId: string;
  onClient: (id: string) => void; onBack: () => void; onAdd: () => void; onEdit: (id: string) => void;
  onInvoice: (id: string) => void; onNewInvoice: (id: string) => void; onPayment: (id: string) => void; onCancel: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const client = clients.find(c => c.id === clientId);
  if (!client) {
    const all = account(invoices, payments, credits);
    const filtered = clients.filter(c => (c.name + " " + c.phone).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))).filter(c => !onlyDue || account(invoices.filter(i => i.client.id === c.id), payments, credits).due > 0);
    return <>
      <div className="heading"><div><small>CLIENTS & PAIEMENTS</small><h1>Qui vous doit quoi ?</h1><p>Ouvrez un client pour voir ses factures et enregistrer ses paiements.</p></div><button className="primary" onClick={onAdd}><Plus size={18} /> Ajouter un client</button></div>
      <div className="account-overview"><div className="receivable-hero"><span><Wallet size={22} /> À recevoir, tous les mois réunis</span><strong>{money(all.due)}</strong><p>Le solde baisse à chaque paiement enregistré.</p></div><div className="account-guide"><span>Un paiement vient d’arriver ?</span><h2>Choisissez le client.<br />Enregistrez le montant.</h2><p>Le reste à payer est calculé pour vous.</p></div></div>
      <section className="card client-directory"><div className="directory-toolbar"><label><Search size={18} /><input aria-label="Rechercher un client" placeholder="Chercher un client…" value={search} onChange={e => setSearch(e.target.value)} /></label><button className={onlyDue ? "filter-pill on" : "filter-pill"} aria-pressed={onlyDue} onClick={() => setOnlyDue(v => !v)}>Avec un reste à payer</button></div>
        {filtered.map(c => { const items = invoices.filter(i => i.client.id === c.id); const a = account(items, payments, credits); return <button className="directory-row" key={c.id} onClick={() => onClient(c.id)}><span className="client-monogram">{c.name.slice(0, 2).toUpperCase()}</span><span className="directory-person"><strong>{c.name}</strong><small>{items.length} facture{items.length > 1 ? "s" : ""} · {c.phone || c.address || "Coordonnées à compléter"}</small></span><span className="directory-balance"><small>{a.refund > 0 && a.due === 0 ? "À restituer au client" : a.due ? "Reste à payer" : items.length ? "Compte soldé" : "Aucune facture"}</small><strong>{money(a.due || a.refund)}</strong></span><ArrowRight size={18} /></button>; })}
        {!filtered.length && <div className="empty"><strong>Aucun client trouvé</strong><span>Essayez un autre nom ou ajoutez un client.</span></div>}
      </section>
    </>;
  }
  const items = invoices.filter(i => i.client.id === client.id).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const a = account(items, payments, credits);
  const unpaid = items.filter(i => balance(i, payments, credits).due > 0);
  const entries = [
    ...items.filter(i => i.advance > 0).map(i => ({ id: `advance-${i.id}`, invoiceId: i.id, amount: i.advance, date: i.date, method: i.payment, reference: "Avance à l’émission", advance: true, cancelledAt: undefined as string | undefined })),
    ...payments.filter(p => items.some(i => i.id === p.invoiceId)).map(p => ({ ...p, advance: false })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <div className="back-line"><button onClick={onBack}><ArrowLeft size={18} /> Tous les clients</button><button onClick={() => onEdit(client.id)}><Pencil size={15} /> Modifier les coordonnées</button></div>
    <div className="heading"><div><small>COMPTE CLIENT · TOUS LES MOIS</small><h1>{client.name}</h1><p>{[client.address, client.phone, client.email].filter(Boolean).join(" · ") || "Les coordonnées peuvent être complétées à tout moment."}</p></div><button className="outline" onClick={() => onNewInvoice(client.id)}><Plus size={17} /> Nouvelle facture</button></div>
    <div className="client-account-summary"><div className={`client-due ${!a.due ? "settled" : ""}`}><span>{a.due ? "Ce client vous doit" : "Aucun montant à recevoir"}</span><strong>{money(a.due)}</strong><small>{unpaid.length} facture{unpaid.length > 1 ? "s" : ""} à régler</small><button disabled={!unpaid.length} onClick={() => onPayment(unpaid[unpaid.length - 1].id)}><Plus size={17} /> Enregistrer un paiement</button></div><div className="client-account-numbers"><div><span>Total facturé</span><strong>{money(a.total)}</strong></div><div><span>Paiements reçus, avances comprises</span><strong>{money(a.received)}</strong></div>{a.credited > 0 && <div><span>Avoirs émis</span><strong>− {money(a.credited)}</strong></div>}{a.refund > 0 && <div className="refund-highlight"><span>À restituer au client</span><strong>{money(a.refund)}</strong></div>}<div className="payment-progress"><span style={{ width: `${a.total ? Math.min(100, (a.received + a.credited) / a.total * 100) : 0}%` }} /></div><p>Le compte réunit toutes les factures, même celles des mois clôturés.</p></div></div>
    <section className="card account-invoices"><div className="list-head"><div><h2>Ses factures</h2><p>À chaque paiement, le statut et le solde se mettent à jour.</p></div><span className="count-label">{items.length} au total</span></div><div className="table-wrap"><table><thead><tr><th>Facture</th><th>Total TTC</th><th>Reçu / Avoir</th><th>Reste à payer</th><th>Statut</th><th></th></tr></thead><tbody>{items.map(i => { const b = balance(i, payments, credits); return <tr key={i.id}><td><button className="invoice-number-link" onClick={() => onInvoice(i.id)}><FileText size={16} />{i.number}</button><small>{date(i.date)}</small></td><td>{money(b.total)}</td><td>{money(b.received)}{b.credited > 0 && <small>Avoir : {money(b.credited)}</small>}</td><td><strong>{money(b.due)}</strong></td><td><PaymentStatus invoice={i} payments={payments} credits={credits} /></td><td>{b.due > 0 ? <button className="pay-row-button" onClick={() => onPayment(i.id)}>Ajouter un paiement <Plus size={14} /></button> : <span className="paid-caption"><Check size={14} /> {b.refund > 0 ? "À restituer : " + money(b.refund) : "Soldée"}</span>}{b.credited < b.total && <button className="credit-row-button" onClick={() => onCredit(i.id)}>Créer un avoir</button>}</td></tr>; })}</tbody></table></div>{!items.length && <div className="empty"><strong>Ce client n’a pas encore de facture</strong><button className="primary" onClick={() => onNewInvoice(client.id)}>Créer sa première facture</button></div>}</section>
    {credits.some(c => items.some(i => i.id === c.invoiceId)) && <section className="card account-history credit-history"><div className="list-head"><div><h2>Ses avoirs</h2><p>Ces documents réduisent les montants facturés.</p></div></div>{credits.filter(c => items.some(i => i.id === c.invoiceId)).map(c => <button className="credit-history-entry" key={c.id} onClick={() => onCreditOpen(c.id)}><FileText size={18} /><span><strong>{c.number} · {money(c.amount)}</strong><small>{date(c.date)} · facture {items.find(i => i.id === c.invoiceId)?.number} · {c.reason}</small></span><ArrowRight size={16} /></button>)}</section>}
    <section className="card account-history"><div className="list-head"><div><h2>Paiements reçus</h2><p>Chaque versement reste dans l’historique.</p></div></div>{entries.map(p => <div className={`payment-entry ${p.cancelledAt ? "cancelled" : ""}`} key={p.id}><span className="entry-icon"><Wallet size={18} /></span><div><strong>{money(p.amount)} {p.cancelledAt && <span>· Annulé</span>}</strong><p>{date(p.date)} · {p.method} · {items.find(i => i.id === p.invoiceId)?.number}</p>{p.reference && <small>{p.reference}</small>}</div>{!p.advance && !p.cancelledAt && <button onClick={() => onCancel(p.id)}>Annuler une erreur</button>}{p.advance && <span className="advance-caption">Avance</span>}</div>)}{!entries.length && <div className="empty compact-empty"><Wallet size={23} /><strong>Aucun paiement enregistré</strong><span>Utilisez « Enregistrer un paiement » dès que le client vous règle.</span></div>}</section>
  </>;
}
