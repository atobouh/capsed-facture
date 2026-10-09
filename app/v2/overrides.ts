/** Rules the Direction can lift. The team keeps clear guardrails; the Direction can always go past them,
 *  with a reason, written in the journal, and undone from Réglages, Règles et dérogations. */
import { commit, getData, monthLabel, money, nowIso, uid } from "./store";
import type { Data, Override } from "./store";

type Action = { label: (d: Data, target: string) => string; apply: (d: Data, target: string) => Partial<Data>; undo: (d: Data, target: string, o: Override) => Partial<Data>; collection: string };
const payLabel = (d: Data, id: string) => { const p = d.payments.find(x => x.id === id), i = d.invoices.find(x => x.id === p?.invoiceId); return p ? `paiement de ${money(p.amount)}${i ? `, ${i.client.name}, facture ${i.number}` : ""}` : "paiement"; };
const mapPay = (d: Data, id: string, f: (p: Data["payments"][number]) => Data["payments"][number]) => ({ payments: d.payments.map(p => p.id === id ? f(p) : p) });
export const ACTIONS: Record<string, Action> = {
  "unlock-payment": {
    collection: "payments", label: (d, id) => `Déverrouiller le ${payLabel(d, id)}`,
    apply: (d, id) => mapPay(d, id, p => ({ ...p, lockedAt: undefined, unlockedAt: nowIso() })),
    undo: (d, id) => mapPay(d, id, p => ({ ...p, lockedAt: nowIso(), unlockedAt: undefined })),
  },
  "restore-payment": {
    collection: "payments", label: (d, id) => `Rétablir le ${payLabel(d, id)}`,
    apply: (d, id) => mapPay(d, id, p => ({ ...p, cancelledAt: undefined, cancelledBy: undefined })),
    undo: (d, id, o) => mapPay(d, id, p => ({ ...p, cancelledAt: String(o.before.cancelledAt ?? nowIso()), cancelledBy: String(o.before.cancelledBy ?? o.by) })),
  },
  "reopen-month": {
    collection: "settings", label: (_d, m) => `Rouvrir ${monthLabel(m)}`,
    apply: (d, m) => ({ closedMonths: d.closedMonths.filter(x => x !== m) }),
    undo: (d, m) => ({ closedMonths: [...new Set([...d.closedMonths, m])].sort() }),
  },
};

function snapshotOf(d: Data, action: string, target: string): Record<string, unknown> {
  if (ACTIONS[action].collection === "payments") { const p = d.payments.find(x => x.id === target); return { lockedAt: p?.lockedAt, cancelledAt: p?.cancelledAt, cancelledBy: p?.cancelledBy }; }
  return { closedMonths: d.closedMonths };
}
const clientOf = (d: Data, action: string, target: string) => ACTIONS[action].collection === "payments" ? d.invoices.find(i => i.id === d.payments.find(p => p.id === target)?.invoiceId) : undefined;

export function liftRule(by: string, action: keyof typeof ACTIONS, target: string, reason: string) {
  const d = getData(), a = ACTIONS[action], label = a.label(d, target), inv = clientOf(d, action, target);
  const o: Override = { id: uid(), at: nowIso(), by, action, label, reason: reason.trim(), target: { collection: a.collection, id: target }, before: snapshotOf(d, action, target), after: {} };
  commit(by, x => { const change = a.apply(x, target); return { ...change, overrides: [{ ...o, after: snapshotOf({ ...x, ...change } as Data, action, target) }, ...(x.overrides ?? [])] }; }, { text: `Dérogation : ${label}. Motif : ${o.reason}`, clientId: inv?.client.id, invoiceId: inv?.id });
}
export function undoOverride(by: string, o: Override, reason: string) {
  const a = ACTIONS[o.action]; if (!a || o.undoneAt) return;
  const inv = clientOf(getData(), o.action, o.target.id);
  commit(by, x => ({ ...a.undo(x, o.target.id, o), overrides: (x.overrides ?? []).map(y => y.id === o.id ? { ...y, undoneAt: nowIso(), undoneBy: by, undoReason: reason.trim() } : y) }), { text: `Dérogation annulée : ${o.label}. Motif : ${reason.trim()}`, clientId: inv?.client.id, invoiceId: inv?.id });
}
