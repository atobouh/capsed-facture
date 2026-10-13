/** What is synchronised between the office computers, the cloud and the Direction site.
 *  Each record travels as its own data (an invoice is ~0.5 KB of JSON); documents are rebuilt from it. */
export type CollectionName = "clients" | "invoices" | "payments" | "credits" | "deliveries" | "requests" | "events" | "accounts" | "overrides" | "settings";
export const LIST_COLLECTIONS = ["clients", "invoices", "payments", "credits", "deliveries", "requests", "events", "accounts", "overrides"] as const;
export type ListCollection = typeof LIST_COLLECTIONS[number];
export const COLLECTIONS: CollectionName[] = [...LIST_COLLECTIONS, "settings"];
/** Where each collection lives in the app's data object. */
export const DATA_KEY: Record<ListCollection, string> = { clients: "clients", invoices: "invoices", payments: "payments", credits: "credits", deliveries: "invoiceDeliveries", requests: "requests", events: "events", accounts: "accounts", overrides: "overrides" };
/** Deliveries have no id of their own: an invoice handed over at a given moment. */
export const keyOf = (c: CollectionName, r: Record<string, unknown>) => c === "deliveries" ? `${r.invoiceId}@${r.declaredAt}` : c === "settings" ? "main" : String(r.id);
/** The shared settings record: the rest of the app data (selected month, online flag…) stays on each computer. */
export const SETTINGS_FIELDS = ["company", "format", "paymentTerm", "closedMonths"] as const;
export const DEVICE_LETTERS = ["", "B", "C", "E", "F", "G", "H"];
/** The Direction site issues its own series so it never collides with an office computer working offline. */
export const DIRECTION_LETTER = "D";
/** What the Direction can delete. A deleted record is never erased: the cloud keeps it in full for the Direction's « Corbeille »,
 *  and office computers only receive a stub (enough to keep its number taken), so it leaves their screens. */
export const BIN_COLLECTIONS = ["clients", "invoices", "payments", "credits"] as const;
export type BinCollection = typeof BIN_COLLECTIONS[number];
export const isBinCollection = (c: string): c is BinCollection => (BIN_COLLECTIONS as readonly string[]).includes(c);
/** The part of a deleted record an office computer receives. */
export const DELETED_STUB_FIELDS = ["id", "number", "date", "legacy", "invoiceId", "deletedAt"];
