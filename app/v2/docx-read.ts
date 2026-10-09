/** Old invoices from Word files (.docx): the text of paragraphs and tables, laid out as lines like a PDF page,
 *  so the same reading applies (see pdf-read.ts). Read in memory, on this computer; the file is let go afterwards. */
import { clean } from "./pdf-read";
import type { TextLine } from "./pdf-read";

// ——— The .docx file is a zip: only word/document.xml is needed ———
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unzipEntry(buf: ArrayBuffer, name: string): Promise<string | null> {
  const b = new Uint8Array(buf), v = new DataView(buf);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("Ce fichier n’est pas un document Word (.docx).");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    if (dec.decode(b.subarray(p + 46, p + 46 + nameLen)) === name) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true), raw = b.subarray(start, start + size);
      return dec.decode(method === 0 ? raw : await inflate(raw));
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

// ——— A small XML reader: enough for WordprocessingML ———
type Node = { tag: string; attrs: string; kids: Node[]; text: string };
function parseXml(xml: string): Node {
  const root: Node = { tag: "#root", attrs: "", kids: [], text: "" }, stack = [root];
  const re = /<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(xml));) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.text += m[5]; continue; }
    if (m[2].startsWith("?") || m[2].startsWith("!")) continue;
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const node: Node = { tag: m[2], attrs: m[3], kids: [], text: "" };
    top.kids.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");

type Para = { text: string; pageBreak: boolean };
/** The paragraphs of a block, in order. Text boxes count as paragraphs of their own; Word's fallback copies are skipped. */
function paragraphs(node: Node, out: Para[] = []): Para[] {
  for (const k of node.kids) {
    if (k.tag === "mc:Fallback" || k.tag === "w:del" || k.tag === "w:instrText") continue;
    if (k.tag === "w:p") {
      const own: string[] = [], boxes: Para[] = [];
      let pageBreak = false;
      const walk = (n: Node) => {
        for (const c of n.kids) {
          if (c.tag === "mc:Fallback" || c.tag === "w:del" || c.tag === "w:instrText") continue;
          if (c.tag === "w:txbxContent") { paragraphs(c, boxes); continue; }
          if (c.tag === "w:t") own.push(unescape(c.text));
          else if (c.tag === "w:tab") own.push("\t");
          else if (c.tag === "w:br" && /w:type="page"/.test(c.attrs)) pageBreak = true;
          else if (c.tag === "w:br" || c.tag === "w:cr") own.push("\n");
          else if (c.tag === "w:pageBreakBefore") pageBreak = true;
          else walk(c);
        }
      };
      walk(k);
      out.push({ text: clean(own.join("")), pageBreak }, ...boxes);
    } else if (k.tag === "w:tbl") {
      // A table inside a paragraph list (in a text box or a cell): its rows, cells side by side.
      for (const tr of k.kids.filter(x => x.tag === "w:tr")) out.push({ text: tr.kids.filter(x => x.tag === "w:tc").map(tc => paragraphs(tc).map(p => p.text.replace(/\s+/g, " ")).filter(Boolean).join(" ")).join("\t"), pageBreak: false });
    } else paragraphs(k, out);
  }
  return out;
}

/** The document as lines: a paragraph is a line (its tabs split it into columns); a table row is one line per paragraph
 *  of its cells, each cell in its own column, so headers and amounts stay above each other. */
export function docxLines(xml: string): TextLine[] {
  const body = parseXml(xml).kids.find(k => k.tag === "w:document")?.kids.find(k => k.tag === "w:body");
  if (!body) return [];
  const lines: TextLine[] = [];
  let y = 100_000, page = 1;
  const push = (cols: string[], step = 100) => {
    const items = cols.map((s, i) => ({ s: s.trim(), x: i * step + 5, y, w: Math.min(step - 10, Math.max(8, s.trim().length * 5)), page })).filter(it => it.s);
    if (items.length) lines.push({ page, y, items, text: items.map(it => it.s).join(" ").replace(/\s+/g, " ").trim() });
    y -= 14;
  };
  const block = (k: Node) => {
    if (k.tag === "w:p") {
      for (const p of paragraphs({ tag: "#", attrs: "", kids: [k], text: "" })) { if (p.pageBreak) { page++; y -= 400; } for (const seg of p.text.split("\n")) push(seg.split("\t"), 150); }
      if (/<w:sectPr/.test(k.attrs)) page++;
    } else if (k.tag === "w:tbl") {
      for (const tr of k.kids.filter(x => x.tag === "w:tr")) {
        // Lines in a cell, whether separate paragraphs or line breaks: one article line each.
        const cells = tr.kids.filter(x => x.tag === "w:tc").map(tc => paragraphs(tc).flatMap(p => p.text.split("\n")).map(t => t.replace(/\t/g, " ")).filter(t => t.trim()));
        const height = Math.max(1, ...cells.map(c => c.length));
        for (let j = 0; j < height; j++) push(cells.map(c => c[j] ?? ""));
        y -= 6;
      }
    } else if (k.tag === "w:sdt" || k.tag === "w:sdtContent" || k.tag === "w:customXml") k.kids.forEach(block);
  };
  body.kids.forEach(block);
  return lines;
}

export async function wordLines(data: ArrayBuffer): Promise<TextLine[]> {
  const xml = await unzipEntry(data, "word/document.xml");
  if (!xml) throw new Error("Ce fichier n’est pas un document Word (.docx).");
  return docxLines(xml);
}
