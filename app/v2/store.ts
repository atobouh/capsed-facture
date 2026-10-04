import { useEffect, useState } from "react";
import { invoiceTotals } from "../invoice-math";
import type { TaxMode } from "../invoice-math";

export type Role = "facturation" | "encaissement" | "responsable";
export type User = { id: string; name: string; role: Role };
export const USERS: User[] = [
  { id: "u-awa", name: "Awa", role: "facturation" },
  { id: "u-paul", name: "Paul", role: "encaissement" },
  { id: "u-dir", name: "La Direction", role: "responsable" },
];
export const ROLE_LABEL: Record<Role, string> = { facturation: "Facturation", encaissement: "Encaissement", responsable: "Responsable" };

export type Client = { id: string; name: string; contact: string; address: string; phone: string; email: string; niu: string; rc: string; archivedAt?: string; createdAt: string; history: { at: string; by: string; before: Omit<Client, "history"> }[] };
export type Company = { name: string; subtitle: string; address: string; phone: string; email: string; niu: string; rc: string; website: string; logo: string };
export type Line = { id: string; contract: string; designation: string; destination: string; quantity: number; unitPrice: number };
export type Delivery = { at: string; by: string; how: string; receivedBy: string; date: string };
export type Invoice = {
  id: string; number: string | null; status: "brouillon" | "emise" | "annulee"; date: string; clientId: string; client: Client; company: Company;
  lines: Line[]; taxRate: number; taxMode: TaxMode; discountRate: number; advance: number; payment: string; note: string; purchaseOrder: string;
  createdBy: string; createdAt: string; issuedAt?: string; abandonedAt?: string; annulled?: { at: string; by: string; reason: string }; delivery?: Delivery;
};
export type PaymentVersion = { amount: number; method: string; reference: string; date: string; at: string; by: string; reason?: string };
export type Payment = { id: string; invoiceId: string; clientId: string; amount: number; method: string; reference: string; date: string; by: string; at: string; versions: PaymentVersion[]; reversed?: { at: string; by: string; reason: string }; validated?: { at: string; by: string } };
export type CreditNote = { id: string; number: string; invoiceId: string; clientId: string; amount: number; reason: string; at: string; by: string; approvedBy: string };
export type RequestKind = "annulation" | "avoir" | "contre-passation" | "archivage" | "verification";
export type Request = {
  id: string; kind: RequestKind; status: "envoyee" | "approuvee" | "refusee" | "traitee";
  clientId: string; invoiceId?: string; paymentId?: string; amount?: number; reason: string; note: string;
  by: string; at: string; readAt?: string; decidedBy?: string; decidedAt?: string; answer?: string;
  paymentDate?: string; method?: string; reference?: string; linkedPaymentId?: string;
};
export type Event = { id: string; at: string; by: string; text: string; clientId?: string; invoiceId?: string; paymentId?: string };
export type Data = { version: 2; company: Company; clients: Client[]; invoices: Invoice[]; payments: Payment[]; credits: CreditNote[]; requests: Request[]; events: Event[]; officeSyncAt: string; officeOffline?: boolean };

export const METHODS = ["Chèque", "Virement", "OM", "MoMo", "Espèces"] as const;
export const REFERENCE_LABEL: Record<string, string> = { "Chèque": "Numéro du chèque", "Virement": "Référence du virement", "OM": "ID de transaction Orange Money", "MoMo": "ID de transaction MTN MoMo", "Espèces": "" };
export const CORRECTION_REASONS = ["Erreur de montant", "Doublon", "Mauvaise facture", "Mauvais client", "Autre"];

const KEY = "capsed-v2";
export const uid = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2)) as string;
export const nowIso = () => new Date().toISOString();
export const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const money = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\s/g, "\u00a0")}\u00a0FCFA`;
export const num = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\s/g, " ");
export const dateFr = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
export const timeFr = (d: string) => new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d.length === 10 ? d + "T12:00:00" : d).getTime()) / 864e5));
export function ago(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "à l’instant"; if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24); return j === 1 ? "hier" : `il y a ${j} jours`;
}
export const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 36e5;
export const userName = (id: string) => USERS.find(u => u.id === id)?.name ?? "Inconnu";

const company: Company = { name: "CAPSED SUARL", subtitle: "Société camerounaise de prestation et de services divers", address: "B.P. 3463 Douala, Cameroun", phone: "+237 243 55 31 56 / 674 55 73 73 / 699 92 80 02", email: "capsedsarl@gmail.com", niu: "M021612485549 S", rc: "RC/DLA/2016B599", website: "", logo: "" };

function seed(): Data {
  const t = Date.now(), at = (days: number, h = 10) => new Date(t - days * 864e5 + h * 36e5 - 10 * 36e5).toISOString(), day = (days: number) => at(days).slice(0, 10);
  const mk = (id: string, name: string, contact: string, address: string, phone: string, email: string, niu: string, rc: string): Client => ({ id, name, contact, address, phone, email, niu, rc, createdAt: at(120), history: [] });
  const clients = [
    mk("c1", "EFMK SARL", "Service comptable", "BP 23247 Douala · 107 Rue Dominique Savio", "+237 6 99 45 67 12", "comptabilite@efmk.cm", "M04000018203-U", "RC/DLN/2008/B/2325"),
    mk("c2", "Horizon Distribution", "Mme Claire M.", "Bonapriso, Douala", "+237 6 77 34 58 12", "finance@horizon.cm", "M09221188991P", "RC/DLA/2020/B/451"),
    mk("c3", "Atlas Commerce", "M. Alain T.", "Akwa, Douala", "+237 6 95 42 07 31", "admin@atlas.cm", "M08001123917L", "RC/DLA/2018/B/238"),
    mk("c4", "Sanaga Logistique", "M. Roger B.", "Bassa, Douala", "+237 6 70 11 22 33", "compta@sanaga.cm", "M07112233445K", "RC/DLA/2017/B/119"),
  ];
  const inv = (id: string, n: string, d: number, c: Client, lines: [string, string, string, number, number][], delivered?: number): Invoice => ({
    id, number: n, status: "emise", date: day(d), clientId: c.id, client: c, company, taxRate: 19.25, taxMode: "ttc", discountRate: 0, advance: 0, payment: "Virement", note: "", purchaseOrder: "",
    lines: lines.map(([contract, designation, destination, quantity, unitPrice], i) => ({ id: `${id}-l${i}`, contract, designation, destination, quantity, unitPrice })),
    createdBy: "u-awa", createdAt: at(d, 9), issuedAt: at(d, 9),
    delivery: delivered !== undefined ? { at: at(delivered, 15), by: "u-awa", how: "En main propre", receivedBy: c.contact || "Accueil", date: day(delivered) } : undefined,
  });
  const invoices = [
    inv("i1", "2026-08-011", 62, clients[0], [["CTE1207111", "23 colis Matandze", "Likous", 38, 25000]], 60),
    inv("i2", "2026-09-004", 34, clients[1], [["CTE1207112", "Prestation de manutention", "Port de Douala", 12, 45000]], 33),
    inv("i3", "2026-09-009", 21, clients[2], [["CTE1207118", "Transport de marchandises", "Yaoundé", 4, 180000], ["CTE1207118", "Frais de chargement", "Douala", 4, 15000]], 20),
    inv("i4", "2026-09-015", 9, clients[0], [["CTE1207125", "Colis express", "Kribi", 15, 30000]], 8),
    inv("i5", "2026-10-001", 2, clients[3], [["CTE1207130", "Stockage entrepôt (mois)", "Bassa", 1, 650000]]),
    inv("i6", "2026-10-002", 1, clients[1], [["CTE1207131", "Prestation de manutention", "Port de Douala", 6, 45000]]),
  ];
  const pay = (id: string, i: Invoice, amount: number, method: string, reference: string, d: number, validated: boolean): Payment => ({
    id, invoiceId: i.id, clientId: i.clientId, amount, method, reference, date: day(d), by: "u-paul", at: at(d, 11), versions: [],
    validated: validated ? { at: at(d - 1, 9), by: "u-dir" } : undefined,
  });
  const payments = [
    pay("p1", invoices[0], 600000, "Chèque", "0045871", 40, true),
    pay("p2", invoices[1], invoiceTotals(invoices[1]).ttc, "Virement", "VIR-88123", 20, true),
    pay("p3", invoices[2], 400000, "OM", "MP260921.1544.C12345", 6, false),
    pay("p4", invoices[3], 200000, "Espèces", "", 1, false),
  ];
  const events: Event[] = [];
  invoices.forEach(i => {
    events.push({ id: uid(), at: i.issuedAt!, by: "u-awa", text: `Facture ${i.number} émise · ${money(invoiceTotals(i).ttc)}`, clientId: i.clientId, invoiceId: i.id });
    if (i.delivery) events.push({ id: uid(), at: i.delivery.at, by: "u-awa", text: `Facture ${i.number} remise au client (${i.delivery.how.toLowerCase()}, reçue par ${i.delivery.receivedBy})`, clientId: i.clientId, invoiceId: i.id });
  });
  payments.forEach(p => {
    const i = invoices.find(x => x.id === p.invoiceId)!;
    events.push({ id: uid(), at: p.at, by: p.by, text: `Paiement de ${money(p.amount)} par ${p.method} sur ${i.number}`, clientId: p.clientId, invoiceId: p.invoiceId, paymentId: p.id });
    if (p.validated) events.push({ id: uid(), at: p.validated.at, by: "u-dir", text: `Paiement de ${money(p.amount)} validé`, clientId: p.clientId, invoiceId: p.invoiceId, paymentId: p.id });
  });
  const requests: Request[] = [
    { id: "r1", kind: "verification", status: "envoyee", clientId: "c1", invoiceId: "i1", amount: 500000, paymentDate: day(3), method: "Virement", reference: "", reason: "", note: "Le client dit avoir viré le solde la semaine dernière.", by: "u-dir", at: at(1, 8) },
  ];
  return { version: 2, company, clients, invoices, payments, credits: [], requests, events, officeSyncAt: at(0, 9.6) };
}

function load(): Data {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d?.version === 2) return d; } } catch { /* stockage indisponible */ }
  return seed();
}
let state: Data | null = null;
const listeners = new Set<() => void>();
export function getData() { return state ??= load(); }
export function setData(next: Data) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  listeners.forEach(l => l());
}
export function resetDemo() { setData(seed()); }
export function useData() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return getData();
}
/** Apply a change made on the office desktop: records an audit event and refreshes the office sync time. */
export function commit(by: string, change: (d: Data) => Partial<Data>, event?: Omit<Event, "id" | "at" | "by">) {
  const d = getData(), patch = change(d), at = nowIso(), role = USERS.find(u => u.id === by)?.role;
  setData({ ...d, ...patch, events: event ? [{ ...event, id: uid(), at, by }, ...(patch.events ?? d.events)] : (patch.events ?? d.events), officeSyncAt: role !== "responsable" ? at : d.officeSyncAt });
}

// ——— Calculations ———
export function invoiceTotal(i: Invoice) { return invoiceTotals(i).ttc; }
export function invoiceBalance(i: Invoice, d: Data) {
  const total = i.status === "annulee" ? 0 : invoiceTotal(i);
  const received = i.advance + d.payments.filter(p => p.invoiceId === i.id && !p.reversed).reduce((s, p) => s + p.amount, 0);
  const credited = d.credits.filter(c => c.invoiceId === i.id).reduce((s, c) => s + c.amount, 0);
  const due = Math.max(0, total - credited - received);
  return { total, received, credited, due };
}
export type Status = "Brouillon" | "Émise" | "Remise au client" | "Partiellement réglée" | "Réglée" | "Annulée";
export function invoiceStatus(i: Invoice, d: Data): Status {
  if (i.status === "brouillon") return "Brouillon";
  if (i.status === "annulee") return "Annulée";
  const b = invoiceBalance(i, d);
  if (b.due === 0) return "Réglée";
  if (b.received > 0 || b.credited > 0) return "Partiellement réglée";
  return i.delivery ? "Remise au client" : "Émise";
}
export const STATUS_TONE: Record<Status, "neutral" | "info" | "warn" | "good" | "bad"> = { "Brouillon": "neutral", "Émise": "info", "Remise au client": "info", "Partiellement réglée": "warn", "Réglée": "good", "Annulée": "bad" };
export function liveInvoices(d: Data) { return d.invoices.filter(i => i.status !== "brouillon"); }
export function openInvoices(d: Data) { return liveInvoices(d).filter(i => i.status === "emise" && invoiceBalance(i, d).due > 0); }
export function clientSummary(c: Client, d: Data) {
  const inv = liveInvoices(d).filter(i => i.clientId === c.id && i.status !== "annulee");
  const sums = inv.map(i => invoiceBalance(i, d));
  const open = inv.filter((_, k) => sums[k].due > 0);
  const lastEvent = d.events.find(e => e.clientId === c.id);
  return {
    billed: sums.reduce((s, b) => s + b.total, 0), received: sums.reduce((s, b) => s + b.received, 0), credited: sums.reduce((s, b) => s + b.credited, 0),
    due: sums.reduce((s, b) => s + b.due, 0), open, oldest: open.length ? Math.max(...open.map(i => daysSince(i.date))) : 0, lastActivity: lastEvent?.at,
  };
}
export function nextInvoiceNumber(d: Data, date: string) {
  const prefix = date.slice(0, 7);
  const max = d.invoices.filter(i => i.number?.startsWith(prefix)).reduce((m, i) => Math.max(m, Number(i.number!.slice(8)) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
export function nextCreditNumber(d: Data) { return `AV-${new Date().getFullYear()}-${String(d.credits.length + 1).padStart(3, "0")}`; }
export function emptyClient(): Client { return { id: uid(), name: "", contact: "", address: "", phone: "", email: "", niu: "", rc: "", createdAt: nowIso(), history: [] }; }
export function emptyLine(): Line { return { id: uid(), contract: "", designation: "", destination: "", quantity: 1, unitPrice: 0 }; }

// ——— Corrections (never deletions) ———
export function applyApproved(r: Request, d: Data, by: string): Partial<Data> & { text: string } {
  const at = nowIso(), inv = d.invoices.find(i => i.id === r.invoiceId);
  if (r.kind === "annulation" && inv) return { invoices: d.invoices.map(i => i.id === inv.id ? { ...i, status: "annulee", annulled: { at, by: r.by, reason: r.reason } } : i), text: `Facture ${inv.number} annulée (${r.reason}). Son numéro est conservé.` };
  if (r.kind === "avoir" && inv) { const number = nextCreditNumber(d); return { credits: [...d.credits, { id: uid(), number, invoiceId: inv.id, clientId: inv.clientId, amount: r.amount ?? 0, reason: r.reason, at, by: r.by, approvedBy: by }], text: `Avoir ${number} de ${money(r.amount ?? 0)} sur ${inv.number} (${r.reason})` }; }
  if (r.kind === "contre-passation") { const p = d.payments.find(x => x.id === r.paymentId); return { payments: d.payments.map(x => x.id === r.paymentId ? { ...x, reversed: { at, by: r.by, reason: r.reason } } : x), text: `Paiement de ${money(p?.amount ?? 0)} contre-passé (${r.reason})` }; }
  if (r.kind === "archivage") { const c = d.clients.find(x => x.id === r.clientId); return { clients: d.clients.map(x => x.id === r.clientId ? { ...x, archivedAt: at } : x), text: `Client ${c?.name} archivé. Ses factures et paiements restent consultables.` }; }
  return { text: "" };
}
export const REQUEST_LABEL: Record<RequestKind, string> = { annulation: "Annulation de facture", avoir: "Avoir (correction de montant)", "contre-passation": "Contre-passation de paiement", archivage: "Archivage du client", verification: "Vérification de paiement" };
