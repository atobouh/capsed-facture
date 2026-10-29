/** What may need a second look once the data of every computer has met in the cloud.
 *  Nothing is refused or removed: these are flags for the Direction, who decides.
 *  - a payment that looks like another one (same invoice, same amount, dates at most 3 days apart), not validated yet;
 *  - an invoice number used twice (an old invoice typed on a computer that had not yet seen the other one);
 *  - an invoice made or changed by the office in a month already closed (marked by the cloud), not validated yet. */
import type { Invoice, Payment } from "./store";

type Data = { invoices: Invoice[]; payments: Payment[] };
const days = (a: string, b: string) => Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5;
export const numberKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, "");

export function findIssues(d: Data) {
  const twinOf = new Map<string, Payment>();
  // Grouped by invoice and amount first, so years of payments stay quick to check.
  const groups = new Map<string, Payment[]>();
  for (const p of d.payments) if (!p.cancelledAt) { const k = p.invoiceId + "|" + p.amount; groups.set(k, [...(groups.get(k) ?? []), p]); }
  for (const group of groups.values()) if (group.length > 1) for (const p of group) {
    if (p.lockedAt) continue;
    const twin = group.find(q => q.id !== p.id && days(q.date, p.date) <= 3);
    if (twin) twinOf.set(p.id, twin);
  }
  const byNumber = new Map<string, Invoice[]>();
  for (const i of d.invoices) { const k = numberKey(i.number); byNumber.set(k, [...(byNumber.get(k) ?? []), i]); }
  const sameNumber = new Map<string, Invoice[]>();
  for (const group of byNumber.values()) if (group.length > 1) for (const i of group) sameNumber.set(i.id, group.filter(x => x.id !== i.id));
  const afterClose = new Set(d.invoices.filter(i => i.afterClose && !i.validatedAt).map(i => i.id));
  return { twinOf, sameNumber, afterClose, count: twinOf.size + new Set([...byNumber.values()].filter(g => g.length > 1).map(g => numberKey(g[0].number))).size + afterClose.size };
}
