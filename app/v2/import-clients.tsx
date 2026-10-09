/** Import existing clients from an Excel (.xlsx) or CSV file instead of typing them one by one.
 *  The columns are recognised by their title (Nom, Adresse, Téléphone, E-mail, NIU, RCCM, Contact…), the result is shown
 *  before anything is saved, and clients already known (same name or same NIU) are left as they are. */
import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Modal, Notice, toast } from "./ui";
import { commit, getData, uid } from "./store";
import type { Client } from "./store";

type Field = keyof Omit<Client, "id" | "archived" | "archivedAt">;
const FIELDS: { key: Field; label: string; names: RegExp }[] = [
  { key: "name", label: "Nom", names: /^(nom|noms|client|clients|raison sociale|societe|entreprise|denomination|name|customer)( du client| client)?$/ },
  { key: "contact", label: "Contact", names: /^(contact|interlocuteur|personne a contacter|responsable|contact name)$/ },
  { key: "address", label: "Adresse", names: /^(adresse|address|ville|localisation|siege|adresse complete)$/ },
  { key: "phone", label: "Téléphone", names: /^(telephone|tel|phone|mobile|portable|numero de telephone|contact telephonique|tel\.)$/ },
  { key: "email", label: "E-mail", names: /^(e-?mail|courriel|mail|adresse e-?mail|adresse mail)$/ },
  { key: "niu", label: "NIU", names: /^(niu|n° contribuable|numero contribuable|numero d'identification unique|identifiant unique)$/ },
  { key: "rc", label: "RCCM", names: /^(rccm|rc|registre de commerce|n° rccm|numero rccm)$/ },
];
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// ——— Reading the file ———
async function unzip(buf: ArrayBuffer): Promise<Map<string, string>> {
  const v = new DataView(buf), out = new Map<string, string>(), dec = new TextDecoder();
  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Ce fichier n’est pas un classeur Excel (.xlsx).");
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extra + comment;
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true), data = new Uint8Array(buf, start, size);
    if (method === 0) out.set(name, dec.decode(data));
    else if (method === 8) out.set(name, await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text());
  }
  return out;
}
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf), xml = (s?: string) => s ? new DOMParser().parseFromString(s, "application/xml") : null;
  const shared = [...(xml(files.get("xl/sharedStrings.xml"))?.getElementsByTagName("si") ?? [])].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent ?? "").join(""));
  // The first sheet of the workbook, as Excel orders them.
  const wb = xml(files.get("xl/workbook.xml")), rels = xml(files.get("xl/_rels/workbook.xml.rels"));
  const rid = wb?.getElementsByTagName("sheet")[0]?.getAttribute("r:id");
  const target = [...(rels?.getElementsByTagName("Relationship") ?? [])].find(r => r.getAttribute("Id") === rid)?.getAttribute("Target");
  const path = target ? "xl/" + target.replace(/^\/?xl\//, "").replace(/^\//, "") : [...files.keys()].find(k => k.startsWith("xl/worksheets/"));
  const sheet = xml(path ? files.get(path) : undefined);
  if (!sheet) throw new Error("Aucune feuille trouvée dans ce classeur.");
  return [...sheet.getElementsByTagName("row")].map(row => {
    const cells: string[] = [];
    for (const c of row.getElementsByTagName("c")) {
      const t = c.getAttribute("t"), raw = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const value = t === "s" ? shared[Number(raw)] ?? "" : t === "inlineStr" ? [...c.getElementsByTagName("t")].map(x => x.textContent).join("") : raw;
      cells[colIndex(c.getAttribute("r") ?? "A")] = value;
    }
    return Array.from(cells, x => (x ?? "").trim());
  });
}
function readCsv(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? "", sep = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

type Plan = { file: string; columns: { field: Field; label: string; title: string }[]; fresh: Client[]; known: number; empty: number };
function plan(file: string, table: string[][]): Plan {
  const rows = table.filter(r => r.some(c => c));
  if (!rows.length) throw new Error("Ce fichier est vide.");
  const head = rows[0].map(norm), columns: Plan["columns"] = [];
  head.forEach((h, i) => { const f = FIELDS.find(x => x.names.test(h) && !columns.some(c => c.field === x.key)); if (f) columns.push({ field: f.key, label: f.label, title: rows[0][i] }); });
  const at = (field: Field) => head.findIndex((h, i) => columns.some(c => c.field === field && c.title === rows[0][i]));
  // No recognised title: the first column is taken as the name, and every row is a client.
  const titled = columns.some(c => c.field === "name"), body = titled ? rows.slice(1) : rows;
  if (!titled) columns.unshift({ field: "name", label: "Nom", title: "1re colonne" });
  const data = getData(), names = new Set(data.clients.map(c => norm(c.name))), nius = new Set(data.clients.map(c => norm(c.niu)).filter(Boolean));
  const fresh: Client[] = []; let known = 0, empty = 0;
  for (const r of body) {
    const get = (f: Field) => { const i = titled ? at(f) : f === "name" ? 0 : -1; return i >= 0 ? (r[i] ?? "").trim() : ""; };
    const c: Client = { id: uid(), name: get("name"), contact: get("contact"), address: get("address"), phone: get("phone"), email: get("email"), niu: get("niu"), rc: get("rc") };
    if (!c.name) { empty++; continue; }
    if (names.has(norm(c.name)) || (c.niu && nius.has(norm(c.niu)))) { known++; continue; }
    names.add(norm(c.name)); if (c.niu) nius.add(norm(c.niu));
    fresh.push(c);
  }
  return { file, columns, fresh, known, empty };
}

export function ImportClients({ by, onClose }: { by: string; onClose: () => void }) {
  const [p, setP] = useState<Plan | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    setError(""); setBusy(true);
    try {
      if (/\.xls$/i.test(file.name)) throw new Error("Ancien format Excel (.xls) : ouvrez-le dans Excel puis « Enregistrer sous » au format .xlsx ou .csv.");
      const table = /\.csv$|\.txt$/i.test(file.name) ? readCsv(await file.text()) : await readXlsx(await file.arrayBuffer());
      setP(plan(file.name, table));
    } catch (e) { setP(null); setError((e as Error).message || "Ce fichier n’a pas pu être lu."); }
    finally { setBusy(false); }
  }
  function save() {
    if (!p?.fresh.length) return;
    commit(by, x => ({ clients: [...x.clients, ...p.fresh] }), { text: `${p.fresh.length} client(s) importé(s) depuis ${p.file}` });
    toast(`${p.fresh.length} client(s) ajouté(s).`); onClose();
  }
  return <Modal side title="Importer des clients" subtitle="Depuis un fichier Excel (.xlsx) ou CSV. Rien n’est enregistré avant votre accord." onClose={onClose}
    actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" disabled={!p?.fresh.length} onClick={save}>{p?.fresh.length ? `Importer ${p.fresh.length} client(s)` : "Importer"}</Button></>}>
    <label className="cx-btn cx-btn-secondary cx-file"><FileUp size={17} aria-hidden="true" /><span>{busy ? "Lecture…" : p ? "Choisir un autre fichier" : "Choisir le fichier"}</span><input type="file" accept=".xlsx,.csv,.txt,.xls" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
    <p className="cx-muted">La première ligne donne le titre des colonnes : Nom (obligatoire), Contact, Adresse, Téléphone, E-mail, NIU, RCCM. Les autres colonnes sont ignorées.</p>
    {error && <Notice tone="bad">{error}</Notice>}
    {p && <>
      <Notice tone={p.fresh.length ? "good" : "warn"} title={`${p.fresh.length} nouveau(x) client(s) dans ${p.file}`}>
        Colonnes reconnues : {p.columns.map(c => c.title === c.label ? c.label : `${c.label} (« ${c.title} »)`).join(", ")}.
        {p.known > 0 && ` ${p.known} déjà enregistré(s) (même nom ou même NIU) : laissé(s) tel(s) quel(s).`}
        {p.empty > 0 && ` ${p.empty} ligne(s) sans nom ignorée(s).`}
      </Notice>
      {p.fresh.length > 0 && <div className="cx-import-preview"><table className="cx-table"><thead><tr><th>Nom</th><th>Téléphone</th><th>Adresse</th><th>NIU</th></tr></thead>
        <tbody>{p.fresh.slice(0, 8).map(c => <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.address}</td><td>{c.niu}</td></tr>)}</tbody></table>
        {p.fresh.length > 8 && <p className="cx-fold-note">… et {p.fresh.length - 8} autre(s).</p>}</div>}
    </>}
  </Modal>;
}
