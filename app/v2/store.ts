import { useEffect, useState } from "react";
import { correctLegacyQuantities, invoiceTotals } from "../invoice-math";
import type { TaxMode } from "../invoice-math";
import { balance as v1Balance } from "../client-account";
import { defaultFormat, restoreFormat } from "../invoice-format";
import type { InvoiceFormat } from "../invoice-format";
import type { CreditNote } from "../credit-note";
import { DATA_KEY, SETTINGS_FIELDS, keyOf } from "./collections";
import type { ListCollection } from "./collections";

/* Data stays compatible with the first prototype ("capsed-facture-v1"), so its backups restore here. */
/** "bureau" is the full office mode: Facturation and Encaissement in one login. */
export type Role = "facturation" | "encaissement" | "bureau" | "responsable";
/** `password` exists only in the demo; the real app keeps a salted hash (see password.ts). */
export type Account = { id: string; name: string; role: Role; login: string; password?: string; pwHash?: string; pwSalt?: string; pwIter?: number; active: boolean; createdAt: string; passwordAt: string };
export const ROLE_LABEL: Record<Role, string> = { facturation: "Facturation", encaissement: "Encaissement", bureau: "Facturation et encaissement", responsable: "Responsable" };
/** What a login may do in the office app. Every tab exists once; the login decides which ones show. */
export const canBill = (r: Role) => r === "facturation" || r === "bureau";
export const canCash = (r: Role) => r === "encaissement" || r === "bureau";
/** Requests addressed to Facturation or Encaissement also reach the full office mode. */
export const receives = (r: Role, to: Role) => to === r || (r === "bureau" && (to === "facturation" || to === "encaissement"));

export type Client = { id: string; name: string; contact: string; address: string; phone: string; email: string; niu: string; rc: string; archived?: boolean; archivedAt?: string };
export type Company = { name: string; subtitle: string; address: string; phone: string; email: string; niu: string; rc: string; website: string; logo: string };
export type Line = { id: string; contract: string; designation: string; destination: string; quantity: number; unitPrice: number };
export type Invoice = { id: string; number: string; date: string; client: Client; company: Company; lines: Line[]; taxRate: number; advance: number; payment: string; note: string; taxMode?: TaxMode; discountRate?: number; purchaseOrder?: string; revisedAt?: string; history?: Invoice[] & { savedAt?: string }[]; template?: unknown; createdBy?: string;
  /** Seen and approved by the Direction. Never required: an invoice not validated is used everywhere like any other. */
  validatedAt?: string; validatedBy?: string;
  /** Internal payment deadline in days. Never printed on the invoice. */
  paymentTerm?: number };
export type PaymentRevision = { amount: number; date: string; method: string; reference: string; savedAt: string; by?: string };
export type Payment = { id: string; invoiceId: string; amount: number; date: string; method: string; reference: string; cancelledAt?: string; cancelledBy?: string; lockedAt?: string; unlockedAt?: string; changedAfterLock?: string; revisedAt?: string; history?: PaymentRevision[]; by?: string; at?: string };
export type Delivery = { invoiceId: string; declaredAt: string; by?: string; cancelledAt?: string; cancelledBy?: string };
export type { CreditNote };
/** Requests only go from the manager to the office team. */
export type RequestKind = "paiement" | "facture" | "client";
export type Request = {
  id: string; kind: RequestKind; to: Role; createdAt: string; by: string;
  clientId?: string; clientName: string; invoiceId?: string; invoiceNumber?: string;
  amount?: number; paymentDate?: string; method?: string; reference?: string; message: string;
  newClient?: Partial<Client>;
  receivedAt?: string; readAt?: string; resolvedAt?: string; resolvedBy?: string; response?: string; linkedId?: string;
};
export type Event = { id: string; at: string; by: string; text: string; clientId?: string; invoiceId?: string };
/** A rule the Direction lifted: what changed, why, and how to put it back. */
export type Override = { id: string; at: string; by: string; action: string; label: string; reason: string; target: { collection: string; id: string }; before: Record<string, unknown>; after: Record<string, unknown>; undoneAt?: string; undoneBy?: string; undoReason?: string };
export type Snapshot = { clients: Client[]; invoices: Invoice[]; payments: Payment[]; credits: CreditNote[]; deliveries: Delivery[]; receivedAt: string };
export type Data = {
  version: 2; company: Company; format: InvoiceFormat; clients: Client[]; invoices: Invoice[]; payments: Payment[]; credits: CreditNote[];
  invoiceDeliveries: Delivery[]; closedMonths: string[]; month: string; requests: Request[]; events: Event[]; accounts: Account[];
  officeOnline: boolean; snapshot: Snapshot;
  /** Default internal payment deadline in days, set by the Direction. */
  paymentTerm?: number;
  overrides?: Override[];
};

/** demo: everything in this browser (GitHub Pages). site: the Direction website, data from the cloud.
 *  office: the desktop app for Facturation and Encaissement, works offline and syncs with the cloud. */
declare const __CAPSED_MODE__: string | undefined;
export const MODE: "demo" | "site" | "office" = typeof __CAPSED_MODE__ === "string" && (__CAPSED_MODE__ === "site" || __CAPSED_MODE__ === "office") ? __CAPSED_MODE__ : "demo";
export const CLOUD = MODE !== "demo";

export const METHODS = ["Chèque", "Virement", "OM", "MoMo", "Espèces"];
export const methodName = (m: string) => ({ OM: "Orange Money", MoMo: "MTN MoMo" } as Record<string, string>)[m] ?? m;
export const REFERENCE_HINT: Record<string, string> = { "Chèque": "Numéro du chèque", "Virement": "Référence du virement", "OM": "ID de transaction Orange Money", "MoMo": "ID de transaction MTN MoMo", "Espèces": "Note (facultatif)" };

const KEY = MODE === "demo" ? "capsed-v2" : `capsed-${MODE}-data`;
export const uid = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2)) as string;
export const nowIso = () => new Date().toISOString();
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const money = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\s/g, " ")} FCFA`;
export const num = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\s/g, " ");
export const dateFr = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
export const timeFr = (d: string) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const monthLabel = (m: string) => new Date(m + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
export const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d.length === 10 ? d + "T12:00:00" : d).getTime()) / 864e5));
export const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 36e5;
export function ago(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return "à l’instant"; if (m < 60) return `il y a ${m} min`; const h = Math.floor(m / 60); if (h < 24) return `il y a ${h} h`; const j = Math.floor(h / 24); return j === 1 ? "hier" : `il y a ${j} jours`; }
export const DEFAULT_TERM = 60;
export const addDays = (date: string, n: number) => { const t = new Date(date + "T12:00:00"); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
/** Payment deadline: the invoice's own, else the Direction's default. Internal only, never on the paper. */
export const termOf = (i: { paymentTerm?: number }) => i.paymentTerm ?? getData().paymentTerm ?? DEFAULT_TERM;
export const dueDateOf = (i: { date: string; paymentTerm?: number }) => addDays(i.date, termOf(i));
/** Days past the deadline, 0 while it has not passed. */
export const overdueDays = (i: { date: string; paymentTerm?: number }) => daysSince(dueDateOf(i));
export const dateValid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(v + "T12:00:00").getTime());

const company: Company = { name: "CAPSED SUARL", subtitle: "Société camerounaise de prestation et de services divers", address: "B.P. 3463 Douala, Cameroun", phone: "+237 243 55 31 56 / 674 55 73 73 / 699 92 80 02", email: "capsedsarl@gmail.com", niu: "M021612485549 S", rc: "RC/DLA/2016B599", website: "", logo: "" };

function seed(): Data {
  const t = Date.now(), at = (days: number, h = 0) => new Date(t - days * 864e5 + h * 36e5).toISOString(), day = (days: number) => { const d = new Date(t - days * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const clients: Client[] = [
    { id: "c1", name: "EFMK SARL", contact: "Service comptable", address: "BP 23247 Douala · 107 Rue Dominique Savio", phone: "+237 6 99 45 67 12", email: "comptabilite@efmk.cm", niu: "M04000018203-U", rc: "RC/DLN/2008/B/2325" },
    { id: "c2", name: "Horizon Distribution", contact: "Mme Claire M.", address: "Bonapriso, Douala", phone: "+237 6 77 34 58 12", email: "finance@horizon.cm", niu: "M09221188991P", rc: "RC/DLA/2020/B/451" },
    { id: "c3", name: "Atlas Commerce", contact: "M. Alain T.", address: "Akwa, Douala", phone: "+237 6 95 42 07 31", email: "admin@atlas.cm", niu: "M08001123917L", rc: "RC/DLA/2018/B/238" },
    { id: "c4", name: "Sanaga Logistique", contact: "M. Roger B.", address: "Bassa, Douala", phone: "+237 6 70 11 22 33", email: "compta@sanaga.cm", niu: "M07112233445K", rc: "RC/DLA/2017/B/119" },
  ];
  const nums: Record<string, number> = {};
  const inv = (id: string, d: number, c: Client, lines: [string, string, string, number, number][], extra: Partial<Invoice> = {}): Invoice => {
    const date = day(d), p = date.slice(0, 7); nums[p] = (nums[p] ?? 0) + 1;
    return { id, number: `${p}-${String(nums[p]).padStart(3, "0")}`, date, client: { ...c }, company, taxRate: 19.25, taxMode: "ttc", discountRate: 0, advance: 0, payment: "Virement", note: "", purchaseOrder: "", createdBy: "u-awa",
      lines: lines.map(([contract, designation, destination, quantity, unitPrice], i) => ({ id: `${id}-l${i}`, contract, designation, destination, quantity, unitPrice })), ...extra };
  };
  const invoices = [
    inv("i1", 62, clients[0], [["CTE1207111", "23 colis Matandze", "Likous", 38, 25000]], { payment: "Chèque" }),
    inv("i2", 34, clients[1], [["CTE1207112", "Traitement phytosanitaire\nConteneur MSNU 923173-6", "Kolkata", 12, 45000]], { purchaseOrder: "BC-2026-014" }),
    inv("i3", 21, clients[2], [["", "Dératisation entrepôt", "Akwa", 4, 180000], ["", "Démoustication bureaux", "Akwa", 4, 15000]], { discountRate: 5, advance: 100000, payment: "OM" }),
    inv("i4", 9, clients[0], [["CTE1207125", "Désherbage chimique", "Kribi", 15, 30000]], { taxMode: "ht", taxRate: 0 }),
    inv("i5", 2, clients[3], [["", "Traitement phytosanitaire\nConteneur TRHU 411783-8", "Norfolk", 1, 650000]]),
    inv("i6", 1, clients[1], [["CTE1207131", "Fourniture de pesticides", "Bonapriso", 6, 45000]]),
  ];
  invoices.slice(0, 4).forEach((i, k) => { i.validatedAt = at([60, 33, 20, 8][k]); i.validatedBy = "u-dir"; });
  const pay = (id: string, i: Invoice, amount: number, method: string, reference: string, d: number, locked: boolean): Payment => ({ id, invoiceId: i.id, amount, method, reference, date: day(d), by: "u-paul", at: at(d), lockedAt: locked ? at(d - 1) : undefined });
  const payments = [
    pay("p1", invoices[0], 600000, "Chèque", "0045871", 40, true),
    pay("p2", invoices[1], invoiceTotals(invoices[1]).ttc, "Virement", "VIR-88123", 20, true),
    pay("p3", invoices[2], 300000, "OM", "MP260921.1544.C12345", 6, false),
    pay("p4", invoices[3], 200000, "Espèces", "", 1, false),
  ];
  const invoiceDeliveries: Delivery[] = [{ invoiceId: "i1", declaredAt: at(60), by: "u-awa" }, { invoiceId: "i2", declaredAt: at(33), by: "u-awa" }, { invoiceId: "i3", declaredAt: at(20), by: "u-awa" }, { invoiceId: "i4", declaredAt: at(8), by: "u-awa" }];
  const events: Event[] = [];
  invoices.forEach(i => events.push({ id: uid(), at: i.date + "T09:00:00.000Z", by: "u-awa", text: `Facture ${i.number} émise · ${money(invoiceTotals(i).ttc)}`, clientId: i.client.id, invoiceId: i.id }));
  invoiceDeliveries.forEach(d => { const i = invoices.find(x => x.id === d.invoiceId)!; events.push({ id: uid(), at: d.declaredAt, by: "u-awa", text: `Facture ${i.number} remise au client`, clientId: i.client.id, invoiceId: i.id }); });
  payments.forEach(p => { const i = invoices.find(x => x.id === p.invoiceId)!; events.push({ id: uid(), at: p.at!, by: "u-paul", text: `Paiement de ${money(p.amount)} par ${p.method} sur ${i.number}`, clientId: i.client.id, invoiceId: i.id }); if (p.lockedAt) events.push({ id: uid(), at: p.lockedAt, by: "u-dir", text: `Paiement de ${money(p.amount)} validé et verrouillé`, clientId: i.client.id, invoiceId: i.id }); });
  events.sort((a, b) => b.at.localeCompare(a.at));
  const accounts: Account[] = [
    { id: "u-awa", name: "Awa Ngo", role: "facturation", login: "awa", password: "CAP-7421", active: true, createdAt: at(120), passwordAt: at(120) },
    { id: "u-paul", name: "Paul Ekane", role: "encaissement", login: "paul", password: "CAP-5308", active: true, createdAt: at(120), passwordAt: at(120) },
    { id: "u-bureau", name: "Rose Tchami", role: "bureau", login: "rose", password: "CAP-4826", active: true, createdAt: at(120), passwordAt: at(120) },
    { id: "u-dir", name: "La Direction", role: "responsable", login: "direction", password: "CAP-9160", active: true, createdAt: at(120), passwordAt: at(120) },
  ];
  const requests: Request[] = [{ id: "r1", kind: "paiement", to: "encaissement", createdAt: at(1), by: "u-dir", clientId: "c1", clientName: "EFMK SARL", invoiceId: "i1", invoiceNumber: invoices[0].number, amount: 500000, paymentDate: day(3), method: "Virement", reference: "", message: "Le client dit avoir viré le solde la semaine dernière.", receivedAt: at(1) }];
  const base = { clients, invoices, payments, credits: [] as CreditNote[], invoiceDeliveries };
  return { version: 2, company, format: defaultFormat, ...base, closedMonths: [], month: todayIso().slice(0, 7), requests, events, accounts, officeOnline: true, snapshot: { ...structuredClone(base), deliveries: structuredClone(invoiceDeliveries), receivedAt: at(0, -0.4) } };
}

/** Accepts a v2 store or a first-prototype backup (same field names). */
export function fromBackup(d: Record<string, unknown>, keep?: Data): Data {
  const base = keep ?? seed();
  const clients = (d.clients as Client[]) ?? base.clients, invoices = (d.invoices as Invoice[]) ?? base.invoices, payments = (d.payments as Payment[]) ?? [], credits = (d.credits as CreditNote[]) ?? [], invoiceDeliveries = (d.invoiceDeliveries as Delivery[]) ?? [], closedMonths = (d.closedMonths as string[]) ?? [];
  const fixed = correctLegacyQuantities(invoices, credits, closedMonths).items as Invoice[];
  const core = { clients, invoices: fixed, payments, credits, invoiceDeliveries };
  return {
    ...base, ...core, version: 2, company: (d.company as Company) ?? base.company, format: d.format || d.models ? restoreFormat(d) : base.format, closedMonths, month: (d.month as string) ?? base.month,
    requests: (d.requests as Request[]) ?? base.requests, events: (d.events as Event[]) ?? base.events, accounts: (d.accounts as Account[]) ?? base.accounts,
    officeOnline: true, snapshot: { ...structuredClone(core), deliveries: structuredClone(invoiceDeliveries), receivedAt: nowIso() },
  };
}
/** A real installation starts empty: everything comes from the cloud or is typed in. */
function emptyData(): Data {
  const core = { clients: [], invoices: [], payments: [], credits: [], invoiceDeliveries: [] };
  return { version: 2, company, format: defaultFormat, ...core, closedMonths: [], month: todayIso().slice(0, 7), requests: [], events: [], accounts: [], overrides: [], officeOnline: true, snapshot: { ...core, deliveries: [], receivedAt: "" } };
}
function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (d?.version === 2 && d.accounts) return CLOUD ? withSnapshot({ ...emptyData(), ...d, month: todayIso().slice(0, 7) }) : d.snapshot ? withDemoAccounts(d) : seed(); }
  } catch { /* stockage indisponible */ }
  return CLOUD ? withSnapshot(emptyData()) : seed();
}
/** Outside the demo there is one copy of the data: the Direction's « snapshot » is the cloud copy itself. */
let receivedAt = () => "";
export function setReceivedAt(f: () => string) { receivedAt = f; }
function withSnapshot(d: Data): Data {
  return { ...d, officeOnline: true, snapshot: { clients: d.clients, invoices: d.invoices, payments: d.payments, credits: d.credits, deliveries: d.invoiceDeliveries, receivedAt: receivedAt() } };
}
/** Demo data saved before the full office mode existed gets its demo login too. */
function withDemoAccounts(d: Data): Data {
  if (!d.accounts.some((a: Account) => a.id === "u-awa") || d.accounts.some((a: Account) => a.id === "u-bureau")) return d;
  return { ...d, accounts: [...d.accounts, seed().accounts.find(a => a.id === "u-bureau")!] };
}
let state: Data | null = null;
const listeners = new Set<() => void>();
export function getData() { return state ??= load(); }
export function setData(next: Data) {
  state = CLOUD ? withSnapshot(next) : next;
  try { localStorage.setItem(KEY, JSON.stringify(CLOUD ? { ...state, snapshot: undefined } : state)); } catch { /* stockage plein */ }
  listeners.forEach(l => l());
}
/** Clear this browser's copy (sign-out on the Direction site, or a computer being reset). */
export function forgetLocalData() { try { localStorage.removeItem(KEY); } catch { /* rien */ } state = null; listeners.forEach(l => l()); }
/** Records received from the cloud: replace or add them, without sending them back. */
export function applyRemote(items: { collection: string; id: string; data: Record<string, unknown> | null }[]) {
  if (!items.length) return;
  const d = getData(), next: Data = { ...d };
  const lists = new Map<string, Record<string, unknown>[]>();
  for (const it of items) {
    if (it.collection === "settings") {
      if (it.data) for (const k of SETTINGS_FIELDS) if (it.data[k] !== undefined) (next as Record<string, unknown>)[k] = it.data[k];
      continue;
    }
    const key = DATA_KEY[it.collection as ListCollection]; if (!key) continue;
    if (!lists.has(key)) lists.set(key, [...((next as Record<string, unknown>)[key] as Record<string, unknown>[] ?? [])]);
    const arr = lists.get(key)!, idx = arr.findIndex(r => keyOf(it.collection as ListCollection, r) === it.id);
    if (!it.data) { if (idx >= 0) arr.splice(idx, 1); }
    else if (idx >= 0) arr[idx] = it.data; else arr.push(it.data);
  }
  for (const [key, arr] of lists) (next as Record<string, unknown>)[key] = key === "events" ? arr.sort((a, b) => String(b.at).localeCompare(String(a.at))) : arr;
  setData(next);
}
/** The sync engine listens to every change made in the app. */
let commitHook: ((prev: Data, next: Data, by: string) => void) | null = null;
export function setCommitHook(f: typeof commitHook) { commitHook = f; }
export function resetDemo() { setData(seed()); }
export function useData() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return getData();
}
const snap = (d: Data, at: string): Snapshot => ({ clients: structuredClone(d.clients), invoices: structuredClone(d.invoices), payments: structuredClone(d.payments), credits: structuredClone(d.credits), deliveries: structuredClone(d.invoiceDeliveries), receivedAt: at });
/** Every change goes through here: it is logged, and when the office is online the manager's view is refreshed. */
export function commit(by: string, change: (d: Data) => Partial<Data>, event?: Omit<Event, "id" | "at" | "by">) {
  const d = getData(), at = nowIso(), next = { ...d, ...change(d) };
  if (event) next.events = [{ ...event, id: uid(), at, by }, ...next.events];
  if (CLOUD) { setData(next); commitHook?.(d, getData(), by); return; }
  if (next.officeOnline) { next.snapshot = snap(next, at); next.requests = next.requests.map(r => r.receivedAt ? r : { ...r, receivedAt: at }); }
  setData(next);
}
export function setOnline(online: boolean) { commit("system", () => ({ officeOnline: online })); }

// ——— Calculations (same rules as the first prototype) ———
export function balance(i: Invoice, payments: Payment[], credits: CreditNote[]) { return v1Balance(i, payments, credits); }
export type Status = "À payer" | "Partiellement réglée" | "Payée" | "Soldée avec avoir" | "À rembourser";
export const STATUS_TONE: Record<string, "neutral" | "info" | "warn" | "good" | "bad"> = { "À payer": "info", "Partiellement réglée": "warn", "Payée": "good", "Soldée avec avoir": "good", "À rembourser": "bad" };
export function delivery(d: { invoiceDeliveries?: Delivery[]; deliveries?: Delivery[] }, invoiceId: string) { return (d.invoiceDeliveries ?? d.deliveries ?? []).filter(x => x.invoiceId === invoiceId && !x.cancelledAt).at(-1); }
export function accountTotals(invoices: Invoice[], payments: Payment[], credits: CreditNote[]) {
  return invoices.reduce((a, i) => { const b = balance(i, payments, credits); return { total: a.total + b.total, received: a.received + b.received, credited: a.credited + b.credited, due: a.due + b.due, refund: a.refund + b.refund }; }, { total: 0, received: 0, credited: 0, due: 0, refund: 0 });
}
/** Each computer that issues invoices offline has its own series: the first keeps 2026-10-001, the others 2026-10-B001…
 *  The Direction site uses the D series. Numbers never collide, even when nobody is connected. */
let seriesLetter = "";
export function setSeriesLetter(l: string) { seriesLetter = l; }
export const getSeriesLetter = () => seriesLetter;
const seriesMax = (numbers: string[], prefix: string) => Math.max(0, ...numbers.map(n => { const m = n.startsWith(prefix) ? n.slice(prefix.length).match(/^(\d+)$/) : null; return m ? Number(m[1]) : 0; }));
export function nextInvoiceNumber(d: Data, period: string) { const prefix = `${period}-${seriesLetter}`; return prefix + String(seriesMax(d.invoices.map(i => i.number), prefix) + 1).padStart(3, "0"); }
export function nextCreditNumber(d: Data, period: string) { const prefix = `AV-${period}-${seriesLetter}`; return prefix + String(seriesMax(d.credits.map(c => c.number), prefix) + 1).padStart(3, "0"); }
export function emptyClient(): Client { return { id: "", name: "", contact: "", address: "", phone: "", email: "", niu: "", rc: "" }; }
export function emptyLine(): Line { return { id: uid(), contract: "", designation: "", destination: "", quantity: 1, unitPrice: 0 }; }
export function accountName(id?: string) { if (!id) return "—"; if (id === "system") return "Système"; return getData().accounts.find(a => a.id === id)?.name ?? "Équipe"; }

// ——— Team accounts (generated by the manager) ———
const WORDS = ["CAP", "SED", "DLA", "BIM", "KRI", "WOU"];
export function generatePassword() { const a = new Uint32Array(2); crypto.getRandomValues(a); return `${WORDS[a[0] % WORDS.length]}-${String(1000 + (a[1] % 9000))}`; }
export function generateLogin(name: string, accounts: Account[]) {
  const base = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, "") || "membre";
  let login = base, n = 2; while (accounts.some(a => a.login === login)) login = base + n++;
  return login;
}
export const REQUEST_LABEL: Record<RequestKind, string> = { paiement: "Paiement à vérifier", facture: "Facture à créer", client: "Client à créer" };
