import { useState } from "react";
import { ArrowRight, Bell, CalendarDays, Check, Download, FileText, FolderOpen, Image as ImageIcon, LockKeyhole, Pencil, Plus, Printer, RotateCcw, Truck, Undo2, Users } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import { exportInvoice } from "../receipt-export";
import { downloadStatement, exportStatementExcel } from "../account-statement";
import { periodTitle } from "../statement-period";
import type { StatementPeriod } from "../statement-period";
import { imageData } from "../document-model";
import { Button, Confirm, CreditPaperView, DateInput, Empty, Field, Modal, Notice, PageHead, Paper, SearchBox, StatementPaper, StatusChip, TextArea, TextInput, Timeline, matches, toast } from "./ui";
import { ClientAccount, ClientForm, ClientsDirectory } from "./clients";
import type { OfficeRoute } from "./clients";
import Composer from "./composer";
import { CreditModal, CreditPicker, PaymentModal } from "./payments";
import { REQUEST_LABEL, accountName, balance, commit, dateFr, dateValid, delivery, fromBackup, getData, monthLabel, money, nowIso, setData, timeFr, todayIso, useData } from "./store";
import type { Company, Request, Role } from "./store";
import { words } from "./words";

type Nav = (r: OfficeRoute) => void;

export function OfficeScreen({ role, by, route, nav }: { role: Role; by: string; route: OfficeRoute; nav: Nav }) {
  switch (route.name) {
    case "compose": return <Composer key={`${route.id}-${route.extra}`} editId={route.id} clientId={route.extra && !route.extra.startsWith("req:") ? route.extra : undefined} requestId={route.extra?.startsWith("req:") ? route.extra.slice(4) : undefined} by={by}
      onDone={id => nav({ name: "invoice", id })} onCancel={() => nav(route.id ? { name: "invoice", id: route.id } : { name: role === "facturation" ? "register" : "clients" })} />;
    case "invoice": return <InvoiceView id={route.id!} role={role} by={by} nav={nav} />;
    case "credit": return <CreditView id={route.id!} nav={nav} />;
    case "clients": return <ClientsDirectory role={role} by={by} nav={nav} />;
    case "client": return <ClientAccount id={route.id!} role={role} by={by} nav={nav} />;
    case "situation": return <Situation clientId={route.id ?? ""} nav={nav} />;
    case "settings": return <Settings by={by} />;
    case "inbox": return <Inbox role={role} by={by} nav={nav} />;
    default: return role === "facturation" ? <Register by={by} nav={nav} /> : <ClientsDirectory role={role} by={by} nav={nav} />;
  }
}

function Register({ by, nav }: { by: string; nav: Nav }) {
  const d = useData(), month = d.month, closed = d.closedMonths.includes(month);
  const [tab, setTab] = useState<"factures" | "avoirs">("factures"), [q, setQ] = useState(""), [selected, setSelected] = useState(""), [picker, setPicker] = useState(false), [credit, setCredit] = useState<string | null>(null), [closing, setClosing] = useState(false);
  const bills = d.invoices.filter(i => i.date.startsWith(month)).sort((a, b) => b.number.localeCompare(a.number)), notes = d.credits.filter(c => c.date.startsWith(month)).sort((a, b) => b.number.localeCompare(a.number));
  const shownBills = bills.filter(i => matches(q, i.number, i.client.name)), shownNotes = notes.filter(c => matches(q, c.number, c.client.name, c.invoiceNumber));
  const active = shownBills.find(i => i.id === selected) ?? shownBills[0], activeNote = shownNotes.find(c => c.id === selected) ?? shownNotes[0], ab = active ? balance(active, d.payments, d.credits) : null;
  const eligible = d.invoices.some(i => { const b = balance(i, d.payments, d.credits); return b.credited < b.total; });
  const setMonth = (m: string) => commit(by, () => ({ month: m }));
  return <div className="cx-page">
    <PageHead kicker="Facturation" title="Factures & avoirs" actions={tab === "factures" ? <Button kind="primary" icon={<Plus size={18} />} disabled={closed} title={closed ? "Ce mois est clôturé" : undefined} onClick={() => nav({ name: "compose" })}>Nouvelle facture</Button> : <Button kind="primary" icon={<Plus size={18} />} disabled={!eligible} onClick={() => setPicker(true)}>Créer un avoir</Button>} />
    <div className="cx-period-row">
      <label className="cx-month"><CalendarDays size={18} /><span>Mois</span><input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Choisir le mois" /></label>
      <span className={`cx-chip cx-tone-${closed ? "neutral" : "good"}`}>{closed ? <LockKeyhole size={12} /> : <Check size={12} />}{closed ? "Mois clôturé" : "Mois ouvert"}</span>
      <div className="cx-tabs" role="tablist"><button role="tab" aria-selected={tab === "factures"} onClick={() => { setTab("factures"); setQ(""); }}><FileText size={17} /> Factures <span>{bills.length}</span></button><button role="tab" aria-selected={tab === "avoirs"} onClick={() => { setTab("avoirs"); setQ(""); }}><Undo2 size={17} /> Avoirs <span>{notes.length}</span></button></div>
    </div>
    <div className="cx-metrics">{tab === "factures" ? <><div><span>Facturé</span><strong>{money(bills.reduce((s, i) => s + balance(i, d.payments, d.credits).total, 0))}</strong></div><div><span>Paiements reçus</span><strong>{money(bills.reduce((s, i) => s + balance(i, d.payments, d.credits).received, 0))}</strong></div><div className="cx-metric-accent"><span>Reste à recevoir</span><strong>{money(bills.reduce((s, i) => s + balance(i, d.payments, d.credits).due, 0))}</strong></div></>
      : <><div><span>Montant des avoirs</span><strong>{money(notes.reduce((s, c) => s + c.amount, 0))}</strong></div><div><span>Documents émis</span><strong>{notes.length}</strong></div><div className="cx-metric-accent"><span>Factures concernées</span><strong>{new Set(notes.map(n => n.invoiceId)).size}</strong></div></>}</div>
    <div className="cx-register">
      <section className="cx-card cx-card-flush">
        <div className="cx-card-head"><div><h2>{tab === "factures" ? "Factures" : "Avoirs"} de {monthLabel(month)}</h2><p className="cx-muted">{tab === "factures" ? "Cliquez une ligne pour voir ses détails, double-cliquez pour l’ouvrir." : "Chaque avoir est lié à une facture et réduit son montant."}</p></div><SearchBox value={q} onChange={setQ} placeholder={tab === "factures" ? "Chercher une facture…" : "Chercher un avoir…"} /></div>
        {tab === "factures" && shownBills.length > 0 && <div className="cx-table-wrap"><table className="cx-table cx-table-select"><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th className="cx-num">Montant</th><th>Statut</th><th>Remise</th><th></th></tr></thead><tbody>
          {shownBills.map(i => { const b = balance(i, d.payments, d.credits); return <tr key={i.id} className={active?.id === i.id ? "cx-selected" : ""} tabIndex={0} onClick={() => setSelected(i.id)} onDoubleClick={() => nav({ name: "invoice", id: i.id })} onKeyDown={e => { if (e.key === "Enter") nav({ name: "invoice", id: i.id }); }}>
            <td><span className="cx-doc-icon"><FileText size={16} /></span><strong>{i.number}</strong></td><td><strong>{i.client.name}</strong></td><td>{dateFr(i.date)}</td><td className="cx-num">{money(b.total)}</td><td><StatusChip status={b.status} /></td><td>{delivery(d, i.id) ? <span className="cx-chip cx-tone-good"><Check size={12} />Remise</span> : <span className="cx-muted">—</span>}</td>
            <td><button type="button" className="cx-icon-btn" aria-label={`Ouvrir la facture ${i.number}`} onClick={e => { e.stopPropagation(); nav({ name: "invoice", id: i.id }); }}><ArrowRight size={17} /></button></td></tr>; })}
        </tbody></table></div>}
        {tab === "avoirs" && shownNotes.length > 0 && <div className="cx-table-wrap"><table className="cx-table cx-table-select"><thead><tr><th>Avoir</th><th>Client</th><th>Facture d’origine</th><th>Date</th><th className="cx-num">Montant</th><th></th></tr></thead><tbody>
          {shownNotes.map(c => <tr key={c.id} className={activeNote?.id === c.id ? "cx-selected" : ""} tabIndex={0} onClick={() => setSelected(c.id)} onDoubleClick={() => nav({ name: "credit", id: c.id })} onKeyDown={e => { if (e.key === "Enter") nav({ name: "credit", id: c.id }); }}>
            <td><strong>{c.number}</strong></td><td>{c.client.name}</td><td>{c.invoiceNumber}</td><td>{dateFr(c.date)}</td><td className="cx-num">− {money(c.amount)}</td><td><button type="button" className="cx-icon-btn" aria-label={`Ouvrir l’avoir ${c.number}`} onClick={e => { e.stopPropagation(); nav({ name: "credit", id: c.id }); }}><ArrowRight size={17} /></button></td></tr>)}
        </tbody></table></div>}
        {(tab === "factures" ? !shownBills.length : !shownNotes.length) && <Empty icon={tab === "factures" ? <FileText size={28} /> : <Undo2 size={28} />} title={q ? "Aucun résultat" : tab === "factures" ? "Pas encore de facture ce mois-ci" : "Pas encore d’avoir ce mois-ci"}
          action={!q ? tab === "factures" ? <Button kind="primary" disabled={closed} onClick={() => nav({ name: "compose" })}>Créer une facture</Button> : <Button disabled={!eligible} onClick={() => setPicker(true)}>Choisir la facture concernée</Button> : undefined}>{q ? "Essayez le nom du client ou le numéro du document." : tab === "factures" ? "Créez la première facture de cette période." : "Un avoir sert à réduire ou annuler le montant d’une facture existante."}</Empty>}
        <div className="cx-card-foot"><span>{tab === "factures" ? `${bills.length} facture${bills.length > 1 ? "s" : ""}` : `${notes.length} avoir${notes.length > 1 ? "s" : ""}`} · {monthLabel(month)}</span><Button size="sm" kind="quiet" icon={<LockKeyhole size={15} />} disabled={closed} onClick={() => setClosing(true)}>{closed ? "Mois clôturé" : "Clôturer ce mois"}</Button></div>
      </section>
      <aside className="cx-inspector">
        <div className="cx-inspector-head">Détails</div>
        {tab === "factures" && active && ab ? <>
          <div className="cx-inspector-id"><span className="cx-doc-icon cx-doc-icon-lg"><FileText size={22} /></span><h2>{active.number}</h2><StatusChip status={ab.status} /></div>
          <div className="cx-inspector-sec"><span>Client</span><button type="button" className="cx-inline-link" onClick={() => nav({ name: "client", id: active.client.id })}>{active.client.name} <ArrowRight size={14} /></button>
            <dl><div><dt>Date</dt><dd>{dateFr(active.date)}</dd></div><div><dt>Prestations</dt><dd>{active.lines.length}</dd></div><div><dt>Règlement</dt><dd>{active.payment}</dd></div><div><dt>Remise au client</dt><dd>{delivery(d, active.id) ? dateFr(delivery(d, active.id)!.declaredAt) : "Pas encore"}</dd></div></dl></div>
          <div className="cx-inspector-sec"><dl><div><dt>Total facturé</dt><dd>{money(ab.total)}</dd></div><div><dt>Reçu</dt><dd>{money(ab.received)}</dd></div>{ab.credited > 0 && <div><dt>Avoirs</dt><dd>− {money(ab.credited)}</dd></div>}</dl><div className="cx-inspector-balance"><span>Reste à payer</span><strong>{money(ab.due)}</strong></div>{ab.refund > 0 && <p className="cx-refund-text">À restituer : {money(ab.refund)}</p>}</div>
          <div className="cx-inspector-actions"><Button kind="primary" wide icon={<FileText size={16} />} onClick={() => nav({ name: "invoice", id: active.id })}>Ouvrir la facture</Button><Button wide icon={<Pencil size={16} />} disabled={d.closedMonths.includes(active.date.slice(0, 7))} onClick={() => nav({ name: "compose", id: active.id })}>Modifier la facture</Button>{ab.credited < ab.total && <Button wide kind="quiet" icon={<Undo2 size={15} />} onClick={() => setCredit(active.id)}>Créer un avoir</Button>}</div>
        </> : tab === "avoirs" && activeNote ? <>
          <div className="cx-inspector-id"><span className="cx-doc-icon cx-doc-icon-lg cx-entry-credit"><Undo2 size={22} /></span><h2>{activeNote.number}</h2><span className="cx-muted">Facture d’avoir</span></div>
          <div className="cx-inspector-sec"><span>Client</span><button type="button" className="cx-inline-link" onClick={() => nav({ name: "client", id: activeNote.client.id })}>{activeNote.client.name} <ArrowRight size={14} /></button><dl><div><dt>Date</dt><dd>{dateFr(activeNote.date)}</dd></div><div><dt>Facture d’origine</dt><dd>{activeNote.invoiceNumber}</dd></div></dl></div>
          <div className="cx-inspector-sec"><span>Motif</span><p>{activeNote.reason}</p><div className="cx-inspector-balance"><span>Montant de l’avoir</span><strong>− {money(activeNote.amount)}</strong></div></div>
          <div className="cx-inspector-actions"><Button kind="primary" wide onClick={() => nav({ name: "credit", id: activeNote.id })}>Ouvrir l’avoir</Button><Button wide onClick={() => nav({ name: "invoice", id: activeNote.invoiceId })}>Voir la facture d’origine</Button></div>
        </> : <div className="cx-inspector-empty"><FileText size={26} /><p>Aucun document sélectionné.</p></div>}
      </aside>
    </div>
    {picker && <CreditPicker onClose={() => setPicker(false)} onPick={id => { setPicker(false); setCredit(id); }} />}
    {credit && <CreditModal invoiceId={credit} by={by} onClose={() => setCredit(null)} onIssued={id => { setCredit(null); nav({ name: "credit", id }); }} />}
    {closing && <Confirm title={`Clôturer ${monthLabel(month)} ?`} confirm="Clôturer et passer au mois suivant" cancel="Annuler" onClose={() => setClosing(false)} onConfirm={() => { const [y, m] = month.split("-").map(Number), n = new Date(y, m, 1), nextM = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; commit(by, x => ({ closedMonths: [...x.closedMonths, month], month: nextM }), { text: `${monthLabel(month)} clôturé` }); setClosing(false); toast(`${monthLabel(month)} clôturé. Le mois suivant est ouvert.`); }}>
      <p>Vous ne pourrez plus émettre ni modifier de facture ou d’avoir daté de ce mois. Les factures existantes resteront consultables et les paiements pourront toujours être enregistrés.</p></Confirm>}
  </div>;
}

function InvoiceView({ id, role, by, nav }: { id: string; role: Role; by: string; nav: Nav }) {
  const d = useData(), i = d.invoices.find(x => x.id === id), [pay, setPay] = useState(false), [credit, setCredit] = useState(false), [undo, setUndo] = useState(false);
  if (!i) return <Empty title="Facture introuvable." action={<Button onClick={() => nav({ name: role === "facturation" ? "register" : "clients" })}>Retour</Button>} />;
  const b = balance(i, d.payments, d.credits), closed = d.closedMonths.includes(i.date.slice(0, 7)), deliv = delivery(d, i.id), biller = role === "facturation";
  return <div className="cx-page">
    <PageHead back={{ label: biller ? "Retour aux factures" : "Compte du client", onClick: () => nav(biller ? { name: "register" } : { name: "client", id: i.client.id }) }} kicker="Facture émise" title={i.number} sub={`Facture du ${dateFr(i.date)} pour ${i.client.name}.${i.revisedAt ? ` Modifiée le ${dateFr(i.revisedAt)}.` : ""}`}
      actions={<><Button kind="quiet" icon={<Download size={17} />} onClick={() => exportInvoice(i, words)}>Exporter en Excel</Button>{biller && <Button icon={<Pencil size={17} />} disabled={closed} title={closed ? "Mois clôturé" : undefined} onClick={() => nav({ name: "compose", id: i.id })}>Modifier la facture</Button>}<Button kind="primary" icon={<Printer size={18} />} onClick={() => window.print()}>Imprimer / PDF</Button></>} />
    {i.history?.length ? <details className="cx-versions cx-noprint"><summary>{i.history.length} version{i.history.length > 1 ? "s" : ""} précédente{i.history.length > 1 ? "s" : ""} conservée{i.history.length > 1 ? "s" : ""}</summary>{i.history.map((v, k) => <details key={k}><summary>Version {k + 1} · {money(invoiceTotals(v).ttc)} · avant modification</summary><Paper invoice={v} title="Version précédente" /></details>)}</details> : null}
    <div className="cx-strip cx-noprint">
      <div className="cx-strip-figures"><StatusChip status={b.status} /><span>Reçu : <strong>{money(b.received)}</strong></span>{b.credited > 0 && <span>Avoirs : <strong>− {money(b.credited)}</strong></span>}{b.refund > 0 && <span>À restituer : <strong>{money(b.refund)}</strong></span>}<span>Reste à payer : <strong>{money(b.due)}</strong></span></div>
      <div className="cx-strip-actions"><Button size="sm" kind="quiet" icon={<Users size={15} />} onClick={() => nav({ name: "client", id: i.client.id })}>Voir le compte client</Button>{biller && b.credited < b.total && <Button size="sm" icon={<Undo2 size={15} />} onClick={() => setCredit(true)}>Créer un avoir</Button>}{!biller && b.due > 0 && <Button size="sm" kind="primary" icon={<Plus size={15} />} onClick={() => setPay(true)}>Enregistrer un paiement</Button>}</div>
    </div>
    <div className="cx-delivery cx-noprint"><span className="cx-delivery-label"><Truck size={18} /> Remise de la facture au client</span>
      {deliv ? <div className="cx-delivery-done"><strong><Check size={15} /> Remise enregistrée le {dateFr(deliv.declaredAt)}</strong><small>par {accountName(deliv.by)}</small>{biller && <Button size="sm" kind="quiet" icon={<RotateCcw size={14} />} onClick={() => setUndo(true)}>Annuler la remise</Button>}</div>
        : biller ? <Button size="sm" title="À utiliser après avoir remis la facture au client. Aucun envoi automatique." onClick={() => { commit(by, x => ({ invoiceDeliveries: [...x.invoiceDeliveries, { invoiceId: i.id, declaredAt: nowIso(), by }] }), { text: `Facture ${i.number} remise au client`, clientId: i.client.id, invoiceId: i.id }); toast("Remise de la facture enregistrée."); }}>Marquer comme remise au client</Button> : <span className="cx-muted">Pas encore remise</span>}</div>
    <Paper invoice={i} title="Aperçu de la facture" />
    <section className="cx-card cx-noprint"><h3 className="cx-card-title">Historique</h3><Timeline events={d.events.filter(e => e.invoiceId === i.id)} /></section>
    {pay && <PaymentModal invoiceId={i.id} by={by} onClose={() => setPay(false)} />}
    {credit && <CreditModal invoiceId={i.id} by={by} onClose={() => setCredit(false)} onIssued={cid => { setCredit(false); nav({ name: "credit", id: cid }); }} />}
    {undo && <Confirm title="Annuler la remise ?" confirm="Annuler la remise" cancel="Garder la remise" onClose={() => setUndo(false)} onConfirm={() => { commit(by, x => ({ invoiceDeliveries: x.invoiceDeliveries.map(r => r.invoiceId === i.id && !r.cancelledAt ? { ...r, cancelledAt: nowIso(), cancelledBy: by } : r) }), { text: `Remise de la facture ${i.number} annulée`, clientId: i.client.id, invoiceId: i.id }); setUndo(false); toast("La remise a été annulée. L’historique la conserve."); }}>
      <p>La facture sera de nouveau indiquée comme non remise. La déclaration du {deliv ? dateFr(deliv.declaredAt) : ""} reste dans l’historique.</p></Confirm>}
  </div>;
}

function CreditView({ id, nav }: { id: string; nav: Nav }) {
  const d = useData(), c = d.credits.find(x => x.id === id);
  if (!c) return <Empty title="Avoir introuvable." />;
  return <div className="cx-page">
    <PageHead back={{ label: "Compte du client", onClick: () => nav({ name: "client", id: c.client.id }) }} kicker="Facture d’avoir" title={c.number} sub={`${c.client.name} · liée à la facture ${c.invoiceNumber}`}
      actions={<><Button onClick={() => nav({ name: "invoice", id: c.invoiceId })}>Voir la facture d’origine</Button><Button kind="primary" icon={<Printer size={18} />} onClick={() => window.print()}>Imprimer / PDF</Button></>} />
    <CreditPaperView credit={c} />
  </div>;
}

function Situation({ clientId, nav }: { clientId: string; nav: Nav }) {
  const d = useData(), year = todayIso().slice(0, 4);
  const [period, setPeriod] = useState<StatementPeriod | null>(null), [draft, setDraft] = useState<StatementPeriod>({ from: year + "-01-01", to: todayIso() }), [error, setError] = useState("");
  const client = d.clients.find(c => c.id === clientId);
  function confirm() { if (!dateValid(draft.from) || !dateValid(draft.to)) return setError("Choisissez deux dates valides."); if (draft.from > draft.to) return setError("La date de début doit précéder la date de fin."); setError(""); setPeriod({ ...draft }); }
  const back = () => nav(clientId ? { name: "client", id: clientId } : { name: "clients" });
  if (!period) return <Modal title={`${client ? "Situation du client" : "Situation globale"} : quelle période ?`} subtitle="Choisissez les dates de l’état à imprimer ou à exporter. Les dettes antérieures sont conservées dans le solde." onClose={back}
    actions={<><Button kind="quiet" onClick={back}>Annuler</Button><Button kind="primary" onClick={confirm}>Afficher la situation</Button></>}>
    {client && <p className="cx-lead">{client.name}</p>}
    <div className="cx-form-grid"><Field label="Du" required><DateInput value={draft.from} onChange={v => setDraft(p => ({ ...p, from: v }))} /></Field><Field label="Au" required><DateInput value={draft.to} min={draft.from} onChange={v => setDraft(p => ({ ...p, to: v }))} /></Field></div>
    <div className="cx-quick">{[["Ce mois-ci", todayIso().slice(0, 8) + "01"], ["Cette année", year + "-01-01"]].map(([l, from]) => <button type="button" key={l} className="cx-pill" onClick={() => setDraft({ from, to: todayIso() })}>{l}</button>)}</div>
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
  return <div className="cx-page">
    <PageHead back={{ label: clientId ? "Compte du client" : "Retour aux clients", onClick: back }} kicker={client ? client.name : "Ensemble des clients"} title={clientId ? "Situation du client" : "Situation globale"} sub={periodTitle(period)}
      actions={<><Button kind="quiet" icon={<CalendarDays size={17} />} onClick={() => setPeriod(null)}>Changer la période</Button><Button icon={<Download size={17} />} onClick={() => exportStatementExcel(d.clients, d.invoices, d.payments, d.credits, clientId, period)}>Excel</Button><Button kind="quiet" icon={<Download size={17} />} onClick={() => downloadStatement(d.clients, d.invoices, d.payments, d.credits, clientId, period)}>Extraire en CSV</Button><Button kind="primary" icon={<Printer size={18} />} onClick={() => window.print()}>Imprimer / PDF</Button></>} />
    <StatementPaper d={d} clientId={clientId} period={period} />
  </div>;
}

export function downloadBackup() { const { snapshot: _s, ...data } = getData(); void _s; const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, exportedAt: nowIso() }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `factures-sauvegarde-${todayIso()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast("Sauvegarde téléchargée : clients, factures, paiements et avoirs."); }

function Settings({ by }: { by: string }) {
  const d = useData(), [company, setCompany] = useState<Company>(d.company), [err, setErr] = useState(""), [restore, setRestore] = useState<Record<string, unknown> | null>(null);
  const dirty = JSON.stringify(company) !== JSON.stringify(d.company);
  async function upload(file?: File) { if (!file) return; try { const data = await imageData(file); commit(by, x => ({ format: { ...x.format, banner: data } }), { text: "Bannière de facture remplacée" }); setErr(""); toast("Bannière enregistrée pour les prochaines factures."); } catch (e) { setErr((e as Error).message); } }
  async function pick(file?: File) { if (!file) return; try { const raw = JSON.parse(await file.text()); if (!Array.isArray(raw.clients) || !Array.isArray(raw.invoices) || typeof raw.company?.name !== "string") throw new Error("Ce fichier n’est pas une sauvegarde de l’application."); setRestore(raw); } catch (e) { toast((e as Error).message || "Impossible de lire cette sauvegarde.", "warn"); } }
  const fields: [keyof Company, string][] = [["name", "Nom de l’entreprise"], ["subtitle", "Activité"], ["address", "Adresse"], ["phone", "Téléphone"], ["email", "Adresse e-mail"], ["website", "Site web"], ["niu", "NIU"], ["rc", "RCCM"]];
  const sample = d.invoices.at(-1);
  return <div className="cx-page">
    <PageHead kicker="Informations permanentes" title="Réglages" />
    <div className="cx-settings-grid">
      <section className="cx-card"><div className="cx-section-title"><b><ImageIcon size={16} /></b><h2>Format de facture</h2></div>
        <p className="cx-muted">Le papier à en-tête CAPSED est intégré. Vous pouvez remplacer la bannière. Le pied de page officiel est toujours imprimé. Les changements concernent les prochaines factures.</p>
        <div className="cx-banner-preview">{d.format.banner ? <img src={d.format.banner} alt="Votre bannière" /> : <img src="capsed-letterhead.webp" alt="Bannière officielle CAPSED" />}</div>
        <div className="cx-card-actions cx-left"><label className="cx-btn cx-btn-secondary cx-file"><ImageIcon size={16} /><span>{d.format.banner ? "Remplacer la bannière" : "Choisir une autre bannière"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {d.format.banner && <Button kind="quiet" icon={<RotateCcw size={15} />} onClick={() => { commit(by, x => ({ format: { ...x.format, banner: "" } }), { text: "Bannière officielle rétablie" }); toast("Bannière officielle CAPSED rétablie."); }}>Revenir à la bannière officielle</Button>}</div>
        {err && <Notice tone="bad">{err}</Notice>}
        {sample && <details className="cx-details-more"><summary>Voir un aperçu avec la bannière actuelle</summary><Paper invoice={{ ...sample, template: undefined }} title="Aperçu · données d’exemple" /></details>}
      </section>
      <section className="cx-card"><div className="cx-section-title"><b><FileText size={16} /></b><h2>Coordonnées de l’entreprise</h2></div>
        <p className="cx-muted">Elles apparaissent sur les prochaines factures.</p>
        <div className="cx-form-grid">{fields.map(([k, label]) => <Field key={k} label={label} wide={k === "subtitle" || k === "address"}><TextInput value={company[k]} onChange={v => setCompany(c => ({ ...c, [k]: v }))} /></Field>)}</div>
        <div className="cx-card-actions"><Button kind="quiet" disabled={!dirty} onClick={() => setCompany(d.company)}>Annuler les changements</Button><Button kind="primary" disabled={!dirty} onClick={() => { commit(by, () => ({ company }), { text: "Coordonnées de l’entreprise modifiées" }); toast("Coordonnées de l’entreprise enregistrées."); }}>Enregistrer les coordonnées</Button></div>
      </section>
      <section className="cx-card"><div className="cx-section-title"><b><Download size={16} /></b><h2>Sauvegarde des données</h2></div>
        <p className="cx-muted">« Sauvegarder mes données » télécharge vos clients, factures, paiements et avoirs dans un fichier. Les sauvegardes du premier prototype sont acceptées.</p>
        <div className="cx-card-actions cx-left"><Button kind="primary" icon={<Download size={16} />} onClick={downloadBackup}>Sauvegarder mes données</Button><label className="cx-btn cx-btn-secondary cx-file"><FolderOpen size={16} /><span>Restaurer une sauvegarde</span><input type="file" accept="application/json,.json" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
      </section>
    </div>
    {restore && <Confirm title="Remplacer les données par cette sauvegarde ?" confirm="Restaurer la sauvegarde" cancel="Garder mes données" onClose={() => setRestore(null)} onConfirm={() => { setData(fromBackup(restore, getData())); setRestore(null); toast("Sauvegarde restaurée."); }}>
      <p>Les clients, factures, paiements et avoirs de ce poste seront remplacés par ceux du fichier ({(restore.invoices as unknown[]).length} factures, {(restore.clients as unknown[]).length} clients).</p><p className="cx-muted">Téléchargez d’abord une copie de vos données actuelles si nécessaire.</p></Confirm>}
  </div>;
}

/** Requests sent by the manager to this role. They never change a balance by themselves. */
function Inbox({ role, by, nav }: { role: Role; by: string; nav: Nav }) {
  const d = useData(), [filter, setFilter] = useState<"open" | "done">("open"), [active, setActive] = useState<string | null>(null), [response, setResponse] = useState(""), [form, setForm] = useState<Request | null>(null), [pay, setPay] = useState<Request | null>(null);
  const mine = d.requests.filter(r => r.to === role && r.receivedAt), visible = mine.filter(r => filter === "done" ? !!r.resolvedAt : !r.resolvedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const r = mine.find(x => x.id === active);
  function open(x: Request) { setActive(x.id); setResponse(x.response ?? ""); if (!x.readAt) commit(by, dd => ({ requests: dd.requests.map(y => y.id === x.id ? { ...y, readAt: nowIso() } : y) })); }
  function resolve() { if (!r || !response.trim()) return; commit(by, dd => ({ requests: dd.requests.map(y => y.id === r.id ? { ...y, resolvedAt: nowIso(), resolvedBy: by, response: response.trim() } : y) }), { text: `Demande traitée : ${REQUEST_LABEL[r.kind]} · ${response.trim()}`, clientId: r.clientId, invoiceId: r.invoiceId }); setActive(null); toast("Réponse envoyée au responsable."); }
  const inv = r?.invoiceId ? d.invoices.find(i => i.id === r.invoiceId) : undefined, invDue = inv ? balance(inv, d.payments, d.credits).due : 0;
  return <div className="cx-page">
    <PageHead kicker="Messages du responsable" title="Demandes" sub={role === "facturation" ? "Factures ou clients à créer, demandés par le responsable." : "Paiements signalés par le responsable, à vérifier."} />
    <div className="cx-tabs cx-tabs-solo" role="tablist"><button role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>À traiter <span>{mine.filter(x => !x.resolvedAt).length}</span></button><button role="tab" aria-selected={filter === "done"} onClick={() => setFilter("done")}>Traitées <span>{mine.filter(x => x.resolvedAt).length}</span></button></div>
    <div className="cx-card cx-card-flush"><div className="cx-entry-list">{visible.map(x => <button type="button" key={x.id} className={`cx-entry${!x.readAt ? " cx-unread" : ""}`} onClick={() => open(x)}>
      <span className="cx-entry-icon"><Bell size={17} /></span><span className="cx-entry-main"><strong>{x.clientName}</strong><p>{REQUEST_LABEL[x.kind]}{x.amount ? ` · ${money(x.amount)}` : ""}{x.invoiceNumber ? ` · ${x.invoiceNumber}` : ""}</p><small>{timeFr(x.createdAt)}{x.readAt ? "" : " · Non lue"}</small></span><RequestState r={x} /><ArrowRight size={16} className="cx-row-go" /></button>)}
      {!visible.length && <Empty icon={<Bell size={24} />} title={filter === "done" ? "Aucune demande traitée" : "Aucune demande à traiter"}>Les demandes du responsable apparaissent ici dès que le poste est connecté.</Empty>}</div></div>
    {r && <Modal title={REQUEST_LABEL[r.kind]} subtitle={`${r.clientName}${r.invoiceNumber ? " · " + r.invoiceNumber : ""} · ${timeFr(r.createdAt)}`} onClose={() => setActive(null)}>
      <div className="cx-request-state"><RequestState r={r} /></div>
      {r.kind === "paiement" && <div className="cx-due-box"><span>Paiement signalé · {r.method} · {r.paymentDate ? dateFr(r.paymentDate) : ""}{r.reference ? ` · réf. ${r.reference}` : ""}</span><strong>{money(r.amount ?? 0)}</strong></div>}
      {r.kind === "client" && r.newClient && <div className="cx-card cx-details">{Object.entries({ Nom: r.newClient.name, Contact: r.newClient.contact, Téléphone: r.newClient.phone, Adresse: r.newClient.address }).filter(([, v]) => v).map(([k, v]) => <p key={k}><span>{k}</span><strong>{v}</strong></p>)}</div>}
      {r.message && <blockquote className="cx-quote">« {r.message} »</blockquote>}
      {r.kind === "paiement" && d.payments.some(p => p.invoiceId === r.invoiceId && !p.cancelledAt && p.amount === r.amount) && <Notice tone="warn">Un paiement du même montant existe déjà sur cette facture. Vérifiez sa date et sa référence avant toute nouvelle saisie.</Notice>}
      <div className="cx-card-actions cx-left">
        {r.invoiceId && <Button onClick={() => { setActive(null); nav({ name: "invoice", id: r.invoiceId }); }}>Voir la facture</Button>}
        {r.clientId && <Button kind="quiet" onClick={() => { setActive(null); nav({ name: "client", id: r.clientId }); }}>Voir le client</Button>}
        {!r.resolvedAt && r.kind === "paiement" && <Button kind="primary" disabled={!invDue} title={!invDue ? "Cette facture est déjà réglée" : undefined} onClick={() => { setActive(null); setPay(r); }}>Vérifier / enregistrer le paiement</Button>}
        {!r.resolvedAt && r.kind === "facture" && <Button kind="primary" icon={<Plus size={16} />} onClick={() => { setActive(null); nav({ name: "compose", extra: "req:" + r.id }); }}>Créer la facture</Button>}
        {!r.resolvedAt && r.kind === "client" && <Button kind="primary" icon={<Plus size={16} />} onClick={() => { setActive(null); setForm(r); }}>Créer le client</Button>}
      </div>
      {r.resolvedAt ? <p className="cx-answer"><strong>Réponse :</strong> {r.response}</p> : <form onSubmit={e => { e.preventDefault(); resolve(); }}>
        <Field label="Résultat de la vérification" hint={r.kind === "paiement" ? "Traiter la demande ne crée pas de paiement. Le solde change uniquement lors d’une écriture de paiement." : "Utilisez ce champ si la demande ne doit pas aboutir à une création."}><TextArea rows={2} value={response} onChange={setResponse} placeholder={r.kind === "paiement" ? "Ex. Déjà enregistré, référence OM123." : "Ex. Le client existe déjà sous le nom…"} /></Field>
        <div className="cx-card-actions"><Button kind="primary" type="submit" disabled={!response.trim()} icon={<Check size={15} />}>Marquer comme traitée</Button></div></form>}
    </Modal>}
    {form && <ClientForm client={{ id: "", name: form.newClient?.name ?? "", contact: form.newClient?.contact ?? "", address: form.newClient?.address ?? "", phone: form.newClient?.phone ?? "", email: form.newClient?.email ?? "", niu: "", rc: "" }} requestId={form.id} by={by} onClose={() => setForm(null)} onSaved={c => { setForm(null); nav({ name: "client", id: c.id }); }} />}
    {pay && pay.invoiceId && <PaymentModal invoiceId={pay.invoiceId} requestId={pay.id} by={by} onClose={() => setPay(null)} />}
  </div>;
}
export function RequestState({ r }: { r: Request }) {
  const [tone, label] = r.resolvedAt ? ["good", "Traitée"] : r.readAt ? ["info", "Lue"] : r.receivedAt ? ["warn", "Reçue sur le poste"] : ["neutral", "En attente de connexion"];
  return <span className={`cx-chip cx-tone-${tone}`}>{label}</span>;
}
