/** Deleting, for the Direction only: a client, an invoice or a payment entered by mistake.
 *  Nothing is erased. The record leaves every list, balance and statement, and the office computers;
 *  the cloud keeps it whole and the Direction restores it from Réglages, Éléments supprimés. */
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import { Button, Empty, Field, Modal, Notice, TextArea, toast } from "./ui";
import { accountName, commit, getData, methodName, money, nowIso, timeFr, useData } from "./store";
import type { BinItem, Client, Data, Deleted, Invoice, Payment } from "./store";
import type { BinCollection } from "./collections";

export type BinTarget = { collection: Extract<BinCollection, "clients" | "invoices" | "payments">; id: string };
type Rec = BinItem["data"];
const LISTS = { clients: "clients", invoices: "invoices", payments: "payments", credits: "credits" } as const;
const strip = (data: Rec) => { const { deletedAt: _a, deletedBy: _b, deleteReason: _c, deletedWith: _d, ...rest } = data; void _a; void _b; void _c; void _d; return rest; };
const inBin = (d: Data, c: BinCollection, id: string) => (d.bin ?? []).find(b => b.collection === c && b.data.id === id);
const invoiceNumber = (d: Data, id: unknown) => d.invoices.find(i => i.id === id)?.number ?? String(inBin(d, "invoices", String(id))?.data.number ?? "");

/** Why this cannot be deleted yet, or null. */
export function deleteBlocker(d: Data, t: BinTarget): string | null {
  if (t.collection === "invoices") {
    const n = d.payments.filter(p => p.invoiceId === t.id && !p.cancelledAt).length;
    return n ? `Cette facture a ${n} paiement${n > 1 ? "s" : ""} enregistré${n > 1 ? "s" : ""}. Supprimez d’abord ${n > 1 ? "ces paiements" : "ce paiement"} (plus bas, dans « Paiements reçus »), puis la facture.` : null;
  }
  if (t.collection === "clients") {
    const n = d.invoices.filter(i => i.client.id === t.id).length;
    return n ? `Ce client a ${n} facture${n > 1 ? "s" : ""}. Supprimez d’abord ${n > 1 ? "ses factures" : "sa facture"}, puis le client.` : null;
  }
  return null;
}
/** What goes away with it: an invoice takes its credit notes and its cancelled payments along. */
function together(d: Data, t: BinTarget) {
  if (t.collection !== "invoices") return { credits: [], payments: [] };
  return { credits: d.credits.filter(c => c.invoiceId === t.id), payments: d.payments.filter(p => p.invoiceId === t.id && p.cancelledAt) };
}
export function describe(d: Data, t: BinTarget) {
  if (t.collection === "invoices") { const i = d.invoices.find(x => x.id === t.id); return i ? `la facture ${i.number} de ${i.client.name} (${money(invoiceTotals(i).ttc)})` : "la facture"; }
  if (t.collection === "payments") { const p = d.payments.find(x => x.id === t.id); return p ? `le paiement de ${money(p.amount)} (${methodName(p.method)}, facture ${invoiceNumber(d, p.invoiceId)})` : "le paiement"; }
  return `le client ${d.clients.find(x => x.id === t.id)?.name ?? ""}`.trim();
}
function effectOf(d: Data, t: BinTarget) {
  const g = together(d, t), withIt = [g.credits.length ? `${g.credits.length} avoir${g.credits.length > 1 ? "s" : ""}` : "", g.payments.length ? `${g.payments.length} paiement${g.payments.length > 1 ? "s" : ""} annulé${g.payments.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ");
  const what = t.collection === "invoices" ? "Elle disparaît des comptes clients, des relevés et des ordinateurs du bureau. Son numéro n’est jamais redonné."
    : t.collection === "payments" ? "Il ne compte plus dans le solde du client et disparaît des ordinateurs du bureau."
    : "Il disparaît de la liste des clients, ici et sur les ordinateurs du bureau.";
  return `${what}${withIt ? ` ${withIt[0].toUpperCase() + withIt.slice(1)} ${g.credits.length + g.payments.length > 1 ? "partent" : "part"} avec elle.` : ""} Rien n’est effacé : vous pouvez ${t.collection === "invoices" ? "la" : "le"} restaurer dans Réglages, Éléments supprimés.`;
}

export function deleteRecord(by: string, t: BinTarget, reason: string) {
  const d = getData(), at = nowIso(), mark: Deleted = { deletedAt: at, deletedBy: by, deleteReason: reason.trim() }, g = together(d, t);
  const ids = { [t.collection]: new Set([t.id]), credits: new Set(g.credits.map(c => c.id)), payments: new Set([...(t.collection === "payments" ? [t.id] : []), ...g.payments.map(p => p.id)]) } as Record<BinCollection, Set<string> | undefined>;
  const inv = t.collection === "invoices" ? d.invoices.find(i => i.id === t.id) : t.collection === "payments" ? d.invoices.find(i => i.id === d.payments.find(p => p.id === t.id)?.invoiceId) : undefined;
  const label = describe(d, t);
  commit(by, x => {
    const moved: BinItem[] = [], change: Partial<Data> = {};
    for (const c of ["clients", "invoices", "payments", "credits"] as const) {
      const set = ids[c]; if (!set?.size) continue;
      const list = x[LISTS[c]] as unknown as Rec[];
      for (const r of list) if (set.has(r.id)) moved.push({ collection: c, data: { ...r, ...mark, ...(c !== t.collection || r.id !== t.id ? { deletedWith: t.id } : {}) } });
      (change as Record<string, unknown>)[LISTS[c]] = list.filter(r => !set.has(r.id));
    }
    return { ...change, bin: [...moved, ...(x.bin ?? [])] };
  }, { text: `Suppression : ${label}. Motif : ${reason.trim()}`, clientId: t.collection === "clients" ? t.id : inv?.client.id, invoiceId: inv?.id });
}

/** Why this cannot be restored on its own yet, or null. */
export function restoreBlocker(d: Data, item: BinItem): string | null {
  if (item.collection !== "payments" && item.collection !== "credits") return null;
  const parent = inBin(d, "invoices", String(item.data.invoiceId));
  return parent ? `Restaurez d’abord la facture ${parent.data.number ?? ""}${item.data.deletedWith ? " : il revient avec elle" : ""}.` : null;
}
/** Everything comes back as it was. An invoice brings back what left with it, and its client if that was deleted too. */
export function restoreRecord(by: string, item: BinItem) {
  const d = getData(), id = item.data.id;
  const back = (d.bin ?? []).filter(b => (b.collection === item.collection && b.data.id === id)
    || (item.collection === "invoices" && (b.data.deletedWith === id || (b.collection === "clients" && b.data.id === (item.data.client as Client | undefined)?.id))));
  const keys = new Set(back.map(b => b.collection + ":" + b.data.id));
  const text = binLabel(d, item);
  commit(by, x => {
    const change: Partial<Data> = { bin: (x.bin ?? []).filter(b => !keys.has(b.collection + ":" + b.data.id)) };
    for (const b of back) { const k = LISTS[b.collection]; (change as Record<string, unknown>)[k] = [...((change as Record<string, unknown>)[k] as Rec[] ?? x[k] as unknown as Rec[]), strip(b.data)]; }
    return change;
  }, { text: `Restauré : ${text}`, clientId: item.collection === "clients" ? id : (item.data.client as Client | undefined)?.id, invoiceId: item.collection === "invoices" ? id : item.collection === "clients" ? undefined : String(item.data.invoiceId ?? "") || undefined });
  return back.length;
}

export function binLabel(d: Data, b: BinItem) {
  const r = b.data;
  if (b.collection === "invoices") { const i = r as unknown as Invoice; return `Facture ${i.number}${i.client ? ` de ${i.client.name}` : ""}${i.lines ? `, ${money(invoiceTotals(i).ttc)}` : ""}`; }
  if (b.collection === "payments") { const p = r as unknown as Payment; return `Paiement de ${money(p.amount ?? 0)}${p.method ? ` (${methodName(p.method)})` : ""}, facture ${invoiceNumber(d, p.invoiceId)}`; }
  if (b.collection === "credits") return `Avoir ${String(r.number ?? "")}, facture ${invoiceNumber(d, r.invoiceId)}`;
  return `Client ${String(r.name ?? "")}`;
}

export function DeleteDialog({ target, by, onClose, onDone }: { target: BinTarget; by: string; onClose: () => void; onDone?: () => void }) {
  const d = useData(), [reason, setReason] = useState(""), [tried, setTried] = useState(false);
  const blocker = deleteBlocker(d, target), label = describe(d, target);
  return <Modal title={`Supprimer ${label} ?`} subtitle="Réservé à la Direction" onClose={onClose}
    actions={blocker ? <Button kind="primary" onClick={onClose}>Compris</Button> : <><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={() => { setTried(true); if (reason.trim().length < 3) return; deleteRecord(by, target, reason); toast(`${label[0].toUpperCase() + label.slice(1)} : supprimé. Restaurable dans Réglages.`); onClose(); onDone?.(); }}>Supprimer</Button></>}>
    {blocker ? <Notice tone="warn" title="Pas encore">{blocker}</Notice> : <>
      <p className="cx-lift-effect">{effectOf(d, target)}</p>
      <Field label="Motif" required error={tried && reason.trim().length < 3 ? "Écrivez le motif en quelques mots." : undefined} hint="Il reste dans le journal, avec votre nom et la date."><TextArea rows={2} value={reason} onChange={setReason} placeholder="Ex. saisie en double, erreur de client" /></Field>
    </>}
  </Modal>;
}

/** Réglages, Éléments supprimés: what the Direction deleted, newest first, each one restorable. */
export function BinPage({ by }: { by: string }) {
  const d = useData(), [ask, setAsk] = useState<BinItem | null>(null);
  const items = (d.bin ?? []).filter(b => b.data.deletedAt && !(b.data.deletedWith && inBin(d, "invoices", b.data.deletedWith))).sort((a, b) => String(b.data.deletedAt).localeCompare(String(a.data.deletedAt)));
  const children = (b: BinItem) => b.collection === "invoices" ? (d.bin ?? []).filter(x => x.data.deletedWith === b.data.id) : [];
  return <section className="cx-section" aria-labelledby="set-bin">
    <div className="cx-section-head"><h2 id="set-bin">Supprimés par la Direction</h2><p>Clients, factures et paiements supprimés par la Direction. Ils ne comptent plus nulle part et ne sont plus sur les ordinateurs du bureau. « Restaurer » les remet exactement comme avant.</p></div>
    {items.length ? <div className="cx-panel cx-list">{items.map(b => { const kids = children(b), blocked = restoreBlocker(d, b);
      return <div key={b.collection + b.data.id} className="cx-list-row cx-static">
        <span className="cx-list-main"><strong>{binLabel(d, b)}</strong><small>Supprimé le {timeFr(String(b.data.deletedAt))} par {b.data.deletedBy === "system" ? "le serveur" : accountName(b.data.deletedBy)}{b.data.deleteReason ? `. Motif : ${b.data.deleteReason}` : ""}{kids.length ? `. Avec : ${kids.map(k => binLabel(d, k)).join(" ; ")}` : ""}</small>{blocked && <small className="cx-warn-text">{blocked}</small>}</span>
        <span className="cx-list-actions"><Button size="sm" icon={<Undo2 size={14} aria-hidden="true" />} disabled={!!blocked} onClick={() => setAsk(b)}>Restaurer</Button></span>
      </div>; })}</div> : <div className="cx-card"><Empty title="Rien n’a été supprimé.">Pour supprimer un client, une facture ou un paiement saisi par erreur, ouvrez-le puis « Autres actions », « Supprimer ».</Empty></div>}
    {ask && <Modal title={`Restaurer : ${binLabel(d, ask)} ?`} onClose={() => setAsk(null)} actions={<><Button kind="quiet" onClick={() => setAsk(null)}>Annuler</Button><Button kind="primary" onClick={() => { const n = restoreRecord(by, ask); toast(n > 1 ? `Restauré, avec ${n - 1} élément(s) liés.` : "Restauré."); setAsk(null); }}>Restaurer</Button></>}>
      <p className="cx-lift-effect">{ask.collection === "invoices" ? "La facture revient dans le compte du client, les relevés et les ordinateurs du bureau, avec ce qui était parti avec elle" + ((d.bin ?? []).some(b => b.collection === "clients" && b.data.id === (ask.data.client as Client | undefined)?.id) ? ", et son client." : ".") : ask.collection === "payments" ? "Le paiement compte de nouveau dans le solde du client, ici et au bureau." : "Il revient partout, comme avant."} La suppression et la restauration restent dans le journal.</p>
    </Modal>}
  </section>;
}
