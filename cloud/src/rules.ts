/** How the cloud merges changes that crossed each other, and who may change what.
 *  The server is the protection: hiding a button in the app is only a convenience. */
import type { CollectionName } from "../../app/v2/collections";

export type Role = "facturation" | "encaissement" | "bureau" | "responsable";
type Rec = Record<string, unknown>;

export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const canBill = (r: Role) => r === "facturation" || r === "bureau";
const canCash = (r: Role) => r === "encaissement" || r === "bureau";

/** Three-way merge on top-level fields: a field the sender did not touch keeps the cloud's value.
 *  Two people changing different fields of the same record both keep their work. */
export function merge(base: Rec | null, current: Rec | null, incoming: Rec): Rec {
  if (!current) return incoming;
  const from = base ?? {};
  const out: Rec = { ...current };
  for (const k of new Set([...Object.keys(current), ...Object.keys(incoming), ...Object.keys(from)])) {
    if (!same(incoming[k], from[k])) { if (incoming[k] === undefined) delete out[k]; else out[k] = incoming[k]; }
  }
  return out;
}

const PAYMENT_CONTENT = ["amount", "date", "method", "reference", "invoiceId", "cancelledAt"];
/** A validated payment changed by the office (offline, before it heard of the validation) is kept,
 *  and goes back to the Direction to validate again. Nothing is refused, nothing is lost. */
export function afterMerge(collection: CollectionName, role: Role, current: Rec | null, merged: Rec, at: string): Rec {
  if (collection === "payments" && current?.lockedAt && role !== "responsable" && PAYMENT_CONTENT.some(k => !same(current[k], merged[k]))) {
    const { lockedAt: _l, ...rest } = merged; void _l;
    return { ...rest, changedAfterLock: at };
  }
  // An invoice changed by the office after the Direction validated it comes back to validate.
  if (collection === "invoices" && current?.validatedAt && role !== "responsable" && changed(current, merged).some(k => k !== "validatedAt" && k !== "validatedBy")) {
    const { validatedAt: _a, validatedBy: _b, ...rest } = merged; void _a; void _b;
    return rest;
  }
  return merged;
}

const changed = (a: Rec | null, b: Rec) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b)])].filter(k => !same(a?.[k], b[k]));
const REQUEST_REPLY = new Set(["receivedAt", "readAt", "resolvedAt", "resolvedBy", "response", "linkedId"]);

/** Returns a reason in French when the change is not allowed for this role, null when it is. */
export function refuse(collection: CollectionName, role: Role, actorId: string, current: Rec | null, next: Rec): string | null {
  if (role === "responsable") return null;
  // Deleting and restoring belong to the Direction; a deleted record no longer changes from the office.
  if (current?.deletedAt) return "Supprimé par la Direction : la modification n’est pas prise en compte.";
  if (next.deletedAt) return "Seule la Direction supprime.";
  const diff = changed(current, next);
  switch (collection) {
    case "clients": case "credits": case "deliveries":
      return canBill(role) ? null : "Seule la facturation modifie les clients, avoirs et remises.";
    case "invoices":
      if (!canBill(role)) return "Seule la facturation modifie les factures.";
      if ((diff.includes("validatedAt") && next.validatedAt) || (diff.includes("validatedBy") && next.validatedBy)) return "Seule la Direction valide une facture.";
      return null;
    case "payments":
      if (!canCash(role)) return "Seul l’encaissement saisit les paiements.";
      if (diff.includes("lockedAt") && next.lockedAt) return "Seule la Direction valide un paiement.";
      if (current?.cancelledAt && !next.cancelledAt) return "Seule la Direction rétablit un paiement annulé.";
      return null;
    case "requests":
      if (!current) return "Seule la Direction envoie des demandes.";
      return diff.every(k => REQUEST_REPLY.has(k)) ? null : "L’équipe peut seulement répondre à une demande.";
    case "events":
      if (current) return "Le journal ne se modifie pas.";
      return next.by === actorId ? null : "Une action du journal doit être signée par son auteur.";
    case "settings": {
      if (!diff.every(k => k === "closedMonths" || k === "id") || !canBill(role)) return "Seule la Direction modifie les réglages.";
      const before = (current?.closedMonths as string[] | undefined) ?? [], after = (next.closedMonths as string[] | undefined) ?? [];
      return before.every(m => after.includes(m)) ? null : "Seule la Direction rouvre un mois clôturé.";
    }
    case "accounts": case "overrides":
      return "Réservé à la Direction.";
  }
  return "Donnée inconnue.";
}
