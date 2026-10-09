/** Old invoices read from their PDF (made on a computer, so the text is in the file).
 *  The PDF is only read in memory, on this computer: its text becomes an invoice draft and the file is let go.
 *  Nothing of the PDF is kept or sent; only the invoice, once checked and saved, travels like any other. */
import { invoiceTotals, normalizePayment, paymentMethods } from "../invoice-math";
import { emptyLine, uid } from "./store";
import type { Client, Line } from "./store";

type Item = { s: string; x: number; y: number; w: number; page: number };
export type TextLine = { page: number; y: number; items: Item[]; text: string };
export type ReadInvoice = {
  number: string; date: string; client: Partial<Client>; purchaseOrder: string; payment: string;
  /** « N/Réf/0003/26/Fact/CAPSED »: the reference printed on the invoice, when it is more than its number. */
  reference: string;
  lines: Line[]; taxMode: "ht" | "ttc"; taxRate: number; discountRate: number; advance: number;
  /** The totals printed on the PDF, to compare with what the lines give. */
  printed: { ht?: number; tax?: number; ttc?: number; total?: number };
  warnings: string[];
};

// ——— pdf.js, loaded only when someone imports (it is large and most days nobody needs it) ———
type PdfJs = { getDocument: (o: { data: Uint8Array; isEvalSupported?: boolean }) => { promise: Promise<PdfDoc> }; GlobalWorkerOptions: { workerSrc: string } };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string; transform?: number[]; width?: number }[] }> }>; destroy: () => Promise<void> };
let pdfjs: Promise<PdfJs> | null = null;
function loadPdfJs() {
  const base = typeof document !== "undefined" ? document.baseURI : "./";
  return pdfjs ??= (import(/* @vite-ignore */ new URL("pdf.min.mjs", base).href) as Promise<PdfJs>).then(m => { m.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", base).href; return m; })
    .catch(e => { pdfjs = null; throw e; });
}

/** The text of a PDF, as lines from top to bottom, page after page. */
export async function pdfLines(data: ArrayBuffer, onPage?: (page: number, pages: number) => void): Promise<TextLine[]> {
  const lib = await loadPdfJs(), doc = await lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  const items: Item[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages);
      const content = await (await doc.getPage(n)).getTextContent();
      for (const it of content.items) { const str = clean(it.str ?? ""); if (str.trim() && it.transform) items.push({ s: str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, page: n }); }
    }
  } finally { await doc.destroy(); }
  return toLines(items);
}
/** Invisible characters some exports (Google Docs) put around every word. */
export const clean = (s: string) => s.replace(/[\u200b-\u200d\u2060\ufeff]/g, "");
export function toLines(items: Item[]): TextLine[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x), lines: TextLine[] = [];
  for (const it of sorted) {
    const last = lines.at(-1);
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= 2.5) last.items.push(it); else lines.push({ page: it.page, y: it.y, items: [it], text: "" });
  }
  for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = joinItems(l.items); }
  return lines;
}
const joinItems = (items: Item[]) => items.reduce((t, it, i) => { const prev = items[i - 1]; return t + (prev && it.x - (prev.x + prev.w) > 1.5 && !/\s$/.test(t) ? " " : "") + it.s; }, "").replace(/\s+/g, " ").trim();

// ——— Numbers and dates as printed in French ———
const SPACE = "[\\s\\u00a0\\u202f.]";
const AMOUNT = new RegExp(`^-?\\d{1,3}(?:${SPACE}\\d{3})+(?:,\\d+)?$|^-?\\d+(?:,\\d+)?$`);
export function amountOf(token: string): number | null {
  const t = token.replace(/(f\s?cfa|xaf|fcfa)$/i, "").replace(/^[−–-]\s*/, "-").trim();
  if (!AMOUNT.test(t)) return null;
  return Math.round(Number(t.replace(/[\s  .]/g, "").replace(",", ".")));
}
/** Amounts written at the end of a line ("Montant HT   630 000"). Groups like "630 000" are rejoined. */
function trailingAmounts(text: string): number[] {
  // A rate (« 19,25 % », « 19,25% ») is never an amount.
  const out: number[] = [], m = text.replace(/\d+(?:[.,]\d+)?\s*%/g, " ").match(/-?\d{1,3}(?:[\s\u00a0\u202f.]\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/g) ?? [];
  for (const tok of m) { const v = amountOf(tok); if (v !== null) out.push(v); }
  return out;
}
const lastAmount = (text: string) => trailingAmounts(text).at(-1);
/** A quantity as printed: « 3 », « 03 », « 56,077 » (m³), « 150 ,246 », « 1 500 ». Decimals are kept. */
export function quantityOf(token: string): number | null {
  const t = token.replace(/[\s\u00a0\u202f]/g, "").replace(/\(.*\)$/, "");
  if (/^\d+,\d+$/.test(t)) return Number(t.replace(",", "."));
  if (/^\d+\.\d{1,2}$|^\d+\.\d{4,}$/.test(t)) return Number(t);
  if (/^\d{1,3}(\.\d{3})+$|^\d+$/.test(t)) return Number(t.replace(/\./g, ""));
  return null;
}
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const iso = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : ""; };
export function dateOf(text: string): string {
  let m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (m) { const y = Number(m[3].length === 2 ? "20" + m[3] : m[3]); const r = iso(y, Number(m[2]), Number(m[1])); if (r) return r; }
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) { const r = iso(Number(m[1]), Number(m[2]), Number(m[3])); if (r) return r; }
  m = plain(text).match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
  if (m) return iso(Number(m[3]), MONTHS.indexOf(m[2]) + 1, Number(m[1]));
  return "";
}
const NUMBER_TOKEN = /\b([A-Z]{0,4}\d[\w]*(?:[-/][\w]+)+|\d{3,})\b/i;

// ——— The invoice ———
type Col = "contract" | "container" | "designation" | "destination" | "quantity" | "unitPrice" | "amount";
const HEADER: [Col, RegExp][] = [["contract", /contrat/i], ["container", /conteneur|container/i], ["designation", /d[ée]signation|libell[ée]|description|prestation/i], ["destination", /destination|lieu/i], ["quantity", /quantit[ée]|qt[ée]|nombre|volume/i], ["unitPrice", /p\.?\s*u\b|prix/i], ["amount", /montant|total/i]];
/** A line made only of column titles (or « (M³) »): part of a table header written on two lines. */
const isHeaderPart = (l: TextLine) => l.items.every(it => (HEADER.some(([, re]) => re.test(it.s)) && it.s === it.s.toUpperCase() && it.s.trim().length <= 25) || /^\(.*\)$/.test(it.s.trim()));
const isHeader = (l: TextLine) => /d[ée]signation|description/i.test(l.text) && /(montant|total|prix)/i.test(l.text);
const END = /^(montant\s*(ht|de\s*d[ée]part|hors)|total|sous[-\s]?total|remise|tva\b|net\s*[àa]\s*payer|arr[êe]t[ée]e)/i;
const FOOTER = /merci pour votre confiance|remercions de votre confiance|\bcapital\b|\bcnps\b|page \d+\s*\/\s*\d+/i;

function readTable(lines: TextLine[], warnings: string[]): Line[] {
  const rows: { y: number; page: number; cells: Record<Col, string[]>; amount?: number }[] = [], loose: { line: TextLine; cells: Record<Col, string[]> }[] = [];
  let cols: { col: Col; x: number }[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isHeader(l)) {
      cols = [];
      // A header cell on two lines (« VOLUME / (M³) ») can sit a little above or below the others: neighbours count too.
      const near = [l, ...[lines[i - 1], lines[i + 1]].filter(n => n && n.page === l.page && Math.abs(n.y - l.y) <= 16 && isHeaderPart(n))];
      for (const h of near) for (const it of h.items) { const hit = HEADER.find(([, re]) => re.test(it.s)); if (hit && !cols.some(c => c.col === hit[0])) cols.push({ col: hit[0], x: it.x + it.w / 2 }); }
      if (!cols.some(c => c.col === "amount")) cols = null;
      if (cols && near.includes(lines[i + 1])) i++;
      continue;
    }
    if (!cols) continue;
    if (i > 0 && l.page !== lines[i - 1].page) { cols = null; continue; } // a new page: wait for its own header
    if (END.test(l.text) || FOOTER.test(l.text)) { cols = null; continue; }
    // A second header line such as « (M³) » under « VOLUME ».
    if (l.items.every(it => /^\(.*\)$/.test(it.s.trim()))) continue;
    const cells = { contract: [], container: [], designation: [], destination: [], quantity: [], unitPrice: [], amount: [] } as Record<Col, string[]>;
    const desig = cols.find(c => c.col === "designation"), right = cols.filter(c => desig && c.x > desig.x), nextRight = Math.min(...right.map(c => c.x));
    for (const it of l.items) {
      const cx = it.x + it.w / 2, near = cols.reduce((a, b) => Math.abs(b.x - cx) < Math.abs(a.x - cx) ? b : a);
      // The description is left-aligned and can be long: text starting in its column stays there.
      const inDesignation = !!desig && near.x > desig.x && it.x < (desig.x + nextRight) / 2 && cx < nextRight;
      cells[inDesignation ? "designation" : near.col].push(it.s.trim());
    }
    const amount = amountOf(cells.amount.join(" "));
    if (amount !== null) rows.push({ y: l.y, page: l.page, cells, amount }); else loose.push({ line: l, cells });
  }
  // A description on several lines: each loose line joins the row printed closest to it (amounts are centred in their row).
  for (const lo of loose) {
    const same = rows.filter(r => r.page === lo.line.page); if (!same.length) continue;
    const r = same.reduce((a, b) => Math.abs(b.y - lo.line.y) < Math.abs(a.y - lo.line.y) ? b : a);
    (r as { extra?: { y: number; cells: Record<Col, string[]> }[] }).extra = [...((r as { extra?: { y: number; cells: Record<Col, string[]> }[] }).extra ?? []), { y: lo.line.y, cells: lo.cells }];
  }
  return rows.map(r => {
    const parts = [{ y: r.y, cells: r.cells }, ...((r as { extra?: { y: number; cells: Record<Col, string[]> }[] }).extra ?? [])].sort((a, b) => b.y - a.y);
    const text = (c: Col) => parts.map(p => p.cells[c].join(" ").replace(/[\s\u00a0\u202f]+/g, " ").trim()).filter(Boolean);
    let designation = [...text("designation"), ...text("container")], contract = text("contract").join(" ");
    designation = designation.filter(t => { const m = t.match(/^contrat\s*:?\s*(.+)$/i); if (m) { contract = m[1].trim(); return false; } return true; });
    const amount = r.amount!, q = quantityOf(text("quantity").join(" ")), pu = amountOf(text("unitPrice").join(" "));
    let quantity = q && q > 0 ? q : pu ? Math.max(1, Math.round(amount / pu)) : 1, unitPrice = pu ?? Math.round(amount / quantity);
    if (Math.round(quantity * unitPrice) !== amount) {
      warnings.push(`Article « ${(designation[0] ?? "").slice(0, 40)} » : ${quantity} × ${unitPrice} ne fait pas ${amount}. Vérifiez la quantité et le prix.`);
      if (quantity > 0 && amount % quantity === 0) unitPrice = amount / quantity; else { quantity = 1; unitPrice = amount; }
    }
    return { ...emptyLine(), id: uid(), designation: designation.join("\n"), destination: text("destination").join("\n"), contract, quantity, unitPrice };
  });
}
/** Without a recognisable header: lines ending with « quantity  unit price  amount » where the multiplication holds. */
function readLooseRows(lines: TextLine[]): Line[] {
  const out: Line[] = [];
  for (const l of lines) {
    if (END.test(l.text) || FOOTER.test(l.text)) continue;
    const m = l.text.match(/^(.*?\D)\s+(\d+)\s+(\d{1,3}(?:[\s  .]\d{3})*|\d+)\s+(\d{1,3}(?:[\s  .]\d{3})*|\d+)$/);
    if (!m) continue;
    const q = Number(m[2]), pu = amountOf(m[3]), amount = amountOf(m[4]);
    if (pu !== null && amount !== null && q > 0 && q * pu === amount && /[a-z]/i.test(m[1])) out.push({ ...emptyLine(), id: uid(), designation: m[1].trim(), quantity: q, unitPrice: pu });
  }
  return out;
}

/** Text in the same column as a label, on the lines just under it (the client block of « FACTURÉ À »). */
function blockUnder(lines: TextLine[], i: number, item: Item, max = 9) {
  const out: string[] = [], right = lines[i].items.find(it => it.x > item.x + item.w + 40)?.x ?? Infinity;
  let lastY = lines[i].y;
  for (let k = i + 1; k < lines.length && out.length < max && lines[k].page === lines[i].page; k++) {
    if (isHeader(lines[k]) || isHeaderPart(lines[k]) || lastY - lines[k].y > (out.length ? 32 : 80)) break; // the block ends at a wide gap or at the table
    const parts = lines[k].items.filter(it => it.x >= item.x - 25 && it.x < right - 5);
    if (!parts.length) continue; // a line of the other column only
    out.push(joinItems(parts)); lastY = lines[k].y;
  }
  return out;
}

const OTHER_LABEL = /^\s*(?:[àa]\s+facturer|factur[ée]\s*[àa]|client|doit|adress[ée]e?\s*[àa])\b/i;
const REF_LABEL = /^\s*r[ée]f(?:[ée]rence|\.)?(?:\s+(?:de\s+la\s+)?facture)?\s*:?\s*$/i;
/** The value of a « RÉFÉRENCE (FACTURE) » box: on the same line after the label, or in the next lines under it
 *  (a Word box may have another column, « A FACTURER », between the label and its value). */
function referenceAt(lines: TextLine[], i: number): string {
  const l = lines[i], at = l.items.findIndex(it => /^\s*r[ée]f(?:[ée]rence|\.)?\b/i.test(it.s));
  if (at < 0) return "";
  const looks = (s: string) => /\d/.test(s) && s.length <= 60 && !(dateOf(s) && s.length <= 12) && !/^\d[\d\s.,]*$/.test(s);
  const same = joinItems(l.items.slice(at)).replace(/^r[ée]f(?:[ée]rence|\.)?(?:\s+(?:de\s+la\s+)?facture)?\s*:?\s*/i, "").trim();
  if (same) return looks(same) ? same : "";
  // The label alone: its words (« REFERENCE », « FACTURE ») give the width of the box; the value is under it.
  const label = l.items.slice(at).filter((it, k, all) => k === 0 || (REF_LABEL.test(joinItems(all.slice(0, k + 1))) && !/\d/.test(it.s)));
  const from = label[0].x - 60, to = Math.max(...label.map(it => it.x + it.w)) + 60;
  for (let k = i + 1; k <= i + 3 && k < lines.length && lines[k].page === l.page; k++) {
    // Another box's label on the same line (« A FACTURER ») is not part of the reference.
    const under = joinItems(lines[k].items.filter(it => it.x + it.w > from && it.x < to && !OTHER_LABEL.test(it.s)));
    if (under && looks(under)) return under;
  }
  return "";
}

export function readInvoice(lines: TextLine[]): ReadInvoice {
  const warnings: string[] = [], body = lines.filter(l => !FOOTER.test(l.text));
  let number = "", date = "", purchaseOrder = "", payment = "", reference = "";
  const client: Partial<Client> = {};
  for (let i = 0; i < body.length; i++) {
    const l = body[i], t = l.text, next = body[i + 1];
    if (!number) {
      const m = t.match(/(?:facture\s*n[°o]|n[°o]\s*(?:de\s*)?facture|r[ée]f[ée]rence)\s*:?\s*([A-Z0-9][\w\-/.]*\d[\w\-/]*)/i);
      if (m) number = m[1];
      else if (/n[°o]\s*(de\s*)?facture/i.test(t) && next) {
        const label = l.items.find(it => /n[°o]/i.test(it.s)), under = label ? next.items.filter(it => Math.abs(it.x + it.w / 2 - (label.x + label.w / 2)) < 60 && !dateOf(it.s)).map(it => it.s).join(" ") : next.text;
        const whole = under.trim();
        number = whole.length <= 20 && /\d/.test(whole) && !dateOf(whole) ? whole : under.match(NUMBER_TOKEN)?.[1] ?? "";
      }
    }
    if (!date && /\bdate\b/i.test(t)) {
      const same = dateOf(t.replace(/.*\bdate\b/i, ""));
      if (same) date = same;
      else if (next) { const label = l.items.find(it => /\bdate\b/i.test(it.s)), under = label ? next.items.filter(it => Math.abs(it.x + it.w / 2 - (label.x + label.w / 2)) < 70).map(it => it.s).join(" ") : ""; date = dateOf(under) || dateOf(next.text); }
    }
    if (!date) { const m = plain(t).match(/\ble\s+(\d.*)$/); if (m && /douala|yaounde|,\s*le\b/.test(plain(t))) date = dateOf(m[1]); }
    if (!client.name) {
      const label = l.items.find(it => /factur[ée]\s*[àa](?![a-z])|(^|\s)[àa]\s+facturer\b|^\s*client\s*:?|^\s*doit\s*:?|adress[ée]e?\s*[àa](?![a-z])/i.test(it.s));
      if (label) {
        const after = (label.s.match(/(?:factur[ée]\s*[àa](?![a-z])|^\s*client|^\s*doit|adress[ée]e?\s*[àa](?![a-z]))\s*:?\s*(.+)$/i)?.[1] ?? "").trim();
        // The reference box may sit in the same column (Word): its value is not the client.
        const block = (after ? [after, ...blockUnder(body, i, label, 8)] : blockUnder(body, i, label)).filter(b => !reference || b !== reference);
        if (block[0]) {
          client.name = block[0];
          const extra: string[] = [];
          for (const b of block.slice(1)) {
            const niu = b.match(/\bNIU\s*:?\s*(\S+(?:\s\S)?)/i), rc = b.match(/\bR\.?C\.?(?:CM)?\s*:?\s*([\w/.-]+)/i), tel = b.match(/^(?:t[ée]l[ée]?(?:phone)?\s*:?\s*)?(\+?\d[\d\s./]{7,})$/i), mail = b.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
            if (niu) client.niu = niu[1].trim(); else if (rc) client.rc = rc[1]; else if (mail) client.email = mail[0]; else if (tel) client.phone = tel[1].trim(); else if (/^(m\.|mme|mlle|mr\b|monsieur|madame|service|attn|a l.attention)/i.test(b) && !client.contact) client.contact = b; else extra.push(b);
          }
          if (extra.length) client.address = extra.join(", ");
        }
      }
    }
    if (!reference && /r[ée]f/i.test(t)) reference = referenceAt(body, i);
    if (!purchaseOrder) { const m = t.match(/(?:b\.?\s*c\.?\s*n[°o]|bon\s*de\s*commande(?:\s*n[°o])?)\s*:?\s*(\S.*)$/i); if (m) purchaseOrder = m[1].trim(); }
    if (!payment) { const m = t.match(/mode\s*de\s*(?:r[èe]glement|paiement)\s*:?\s*(.+)$/i); if (m) { const p = normalizePayment(m[1].trim()); payment = paymentMethods.includes(p) ? p : /ch[èe]que/i.test(p) ? "Chèque" : /virement|banque/i.test(p) ? "Virement" : /orange/i.test(p) ? "OM" : /mtn|momo/i.test(p) ? "MoMo" : /esp[èe]ce/i.test(p) ? "Espèces" : ""; } }
  }
  if (!number) { const m = body.map(l => l.text).join(" ").match(/\b(\d{4}-\d{2}-[A-Z]?\d{3})\b/); if (m) number = m[1]; }
  if (!date) for (const l of body) { const d = dateOf(l.text); if (d) { date = d; break; } }

  // Totals printed under the table.
  const printed: ReadInvoice["printed"] = {};
  let subtotal: number | undefined, discount: number | undefined, advance = 0, rate: number | undefined, vatLine = false;
  for (const [k, l] of body.entries()) {
    if (isHeader(l)) continue;
    let t = l.text;
    const isVat = /\btva\b/i.test(t) && !/^\s*(n°|niu|num)/i.test(t);
    // On a VAT line, « 19,25 » (with or without %) is the rate: amounts in FCFA have no decimals.
    if (isVat) { const r = t.match(/(\d{1,2}[.,]\d{1,2})(?!\d)\s*%?|(\d{1,2})\s*%/); if (r) { rate = Number((r[1] ?? r[2]).replace(",", ".")); t = t.replace(r[0], " "); } }
    let v = lastAmount(t);
    // « TVA 19,25 % » with its amount on the line just below.
    if (isVat) {
      vatLine = true;
      const next = body[k + 1];
      if (v === undefined && next && next.page === l.page && Math.abs(next.y - l.y) <= 22 && /^[\d\s\u00a0\u202f.,-]+$/.test(next.text)) v = lastAmount(next.text);
    }
    if (v === undefined) continue;
    if (/montant\s*de\s*d[ée]part|sous[-\s]?total/i.test(t)) subtotal = v;
    else if (/apr[èe]s\s*remise/i.test(t)) printed.ht = v;
    else if (/remise/i.test(t)) discount = Math.abs(v);
    else if (/avance/i.test(t)) advance = Math.abs(v);
    else if (/\btva\b/i.test(t)) { printed.tax = v; const r = t.match(/(\d+(?:[.,]\d+)?)\s*%/); if (r) rate = Number(r[1].replace(",", ".")); }
    else if (/total\s*t\.?t\.?c|montant\s*t\.?t\.?c|net\s*[àa]\s*payer/i.test(t)) printed.ttc = v;
    else if (/(montant|total)\s*(h\.?t|hors\s*taxe)/i.test(t) || /montant\s*ht\s*apr[èe]s\s*remise/i.test(t)) printed.ht = v;
    else if (/^total\b/i.test(t)) printed.total = v;
  }

  let items = readTable(lines, warnings);
  if (!items.length) items = readLooseRows(body);
  const ht = printed.ht ?? (printed.ttc !== undefined && printed.tax !== undefined ? printed.ttc - printed.tax : undefined) ?? printed.ttc ?? printed.total;
  if (!items.length && ht) { items = [{ ...emptyLine(), id: uid(), designation: "Prestations (à détailler)", quantity: 1, unitPrice: (subtotal ?? ht) }]; warnings.push("Les articles n’ont pas été reconnus : une seule ligne reprend le montant. Détaillez-les si besoin."); }
  // TTC only when the document shows VAT: an amount, or a VAT line with its rate. Without a VAT line, nothing is added.
  const taxMode: "ht" | "ttc" = (printed.tax && printed.tax > 0) || (vatLine && (rate ?? 0) > 0) ? "ttc" : "ht";
  const base = subtotal ?? items.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  const discountRate = discount && base ? Math.round(discount / base * 1e6) / 1e4 : 0;
  let taxRate = 19.25;
  if (taxMode === "ttc") {
    // The rate written on the document comes first; otherwise it is worked out from the amounts.
    const r = rate ?? (ht && printed.tax ? Math.round(printed.tax / ht * 1e4) / 100 : 19.25);
    if (r < 1 || r > 50) { taxRate = 19.25; warnings.push(`La TVA lue sur le document (${printed.tax}) ne correspond à aucun taux plausible : 19,25 % est appliqué, vérifiez.`); }
    else taxRate = Math.abs(r - 19.25) < 0.06 ? 19.25 : r;
  }

  if (!number) warnings.push("Numéro de facture non trouvé.");
  if (!date) warnings.push("Date non trouvée.");
  if (!client.name) warnings.push("Client non trouvé.");
  const draft = { lines: items, taxRate: taxMode === "ttc" ? taxRate : 0, taxMode, discountRate, advance };
  if (items.length) {
    const t = invoiceTotals(draft);
    if (printed.ttc !== undefined && taxMode === "ttc" && t.ttc !== printed.ttc) warnings.push(`Le total TTC calculé (${t.ttc}) diffère de celui du document (${printed.ttc}).`);
    else if (printed.ht !== undefined && t.ht !== printed.ht) warnings.push(`Le montant HT calculé (${t.ht}) diffère de celui du document (${printed.ht}).`);
    else if (printed.ttc === undefined && printed.ht === undefined && printed.total !== undefined && t.ttc !== printed.total) warnings.push(`Le total calculé (${t.ttc}) diffère de celui du document (${printed.total}).`);
  }
  // A reference that is only the number again (« Référence : FA 0003 ») says nothing more.
  if (reference.replace(/\s/g, "").toLowerCase() === number.replace(/\s/g, "").toLowerCase()) reference = "";
  return { number, date, client, purchaseOrder, payment, reference, ...draft, printed, warnings };
}

/** One file can hold many invoices (one after the other, often one per page): it is cut at each title « FACTURE ».
 *  A page without its own title continues the invoice before it. */
const TITLE = /^facture(\s+(ttc|ht|hors\s+taxe))?$/i;
export function splitInvoices(lines: TextLine[]): TextLine[][] {
  const groups: TextLine[][] = [];
  for (const l of lines) {
    if (TITLE.test(l.text.trim()) || !groups.length) groups.push([]);
    groups.at(-1)!.push(l);
  }
  // Text before the first title (a letterhead) belongs to the first invoice.
  if (groups.length > 1 && !TITLE.test(groups[0][0].text.trim()) && groups[0].length < 8 && !groups[0].some(isHeader)) groups.splice(0, 2, [...groups[0], ...groups[1]]);
  return groups;
}
