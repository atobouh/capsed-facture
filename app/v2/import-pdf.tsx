/** Old invoices from their files, in batches (Facturation): PDF or Word (.docx), one or many invoices per file.
 *  Factures › « ⋯ » › « Importer d’anciennes factures » opens a drop window; the files are then read on this computer,
 *  turned into invoice drafts, and let go: no file is ever kept or sent.
 *  Each draft is checked, then saved as an old invoice (« Ancienne »), with its own number and date.
 *  Old invoices need no validation by the Direction.
 *  A document that shows no payment mode is imported as « Virement ». « Tout annuler » drops what is not saved. */
import { useEffect, useRef, useState } from "react";
import { Check, FileText, FileUp, Loader2, UserPlus, X } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import Composer, { emptyDraft, newInvoiceRecord, numberTaken } from "./composer";
import type { Draft } from "./composer";
import { ClientForm } from "./clients";
import { Button, Confirm, Modal, Notice, PageHead, toast } from "./ui";
import { commit, dateFr, emptyClient, getData, money, monthLabel, todayIso, useData } from "./store";
import type { Client, Data } from "./store";
import { pdfLines, readInvoice, splitInvoices } from "./pdf-read";
import type { ReadInvoice } from "./pdf-read";
import { wordLines } from "./docx-read";

type Kind = "pdf" | "docx";
type Job = { key: string; name: string; kind: Kind; state: "waiting" | "reading" | "done" | "failed"; page?: number; pages?: number; found: number; error?: string };
type Item = { key: string; file: string; page: number; state: "read" | "saved" | "skipped"; read: ReadInvoice; invoiceId?: string; number?: string };
// Kept while the app is open, so going to an invoice and back does not lose the batch. Only the text read is kept, never a file.
let keptJobs: Job[] = [], keptItems: Item[] = [];
const waiting: { key: string; file: File }[] = [];
/** Changes at each « Tout annuler »: a file still being read when the import was cancelled adds nothing. */
let batch = 0;
const kindOf = (f: File): Kind | null => f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : /\.docx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? "docx" : null;
/** Files chosen in the drop window, read as soon as the import page opens. Returns the files that cannot be read. */
export function queueFiles(files: File[]) {
  const refused: string[] = [];
  for (const f of files) {
    const kind = kindOf(f);
    if (!kind) { refused.push(f.name); continue; }
    const key = crypto.randomUUID();
    waiting.push({ key, file: f });
    keptJobs = [...keptJobs, { key, name: f.name, kind, state: "waiting", found: 0 }];
  }
  return refused;
}

const simple = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(sarl|sa|suarl|sas|ets|etablissements|ste|societe)\b/g, "").trim();
/** The client already in the app: same NIU, or the same name (accents, case and legal form aside). */
export function matchClient(clients: Client[], c: Partial<Client>) {
  const niu = c.niu?.replace(/\s/g, "").toLowerCase();
  return (niu && clients.find(x => x.niu && x.niu.replace(/\s/g, "").toLowerCase() === niu)) || (c.name ? clients.find(x => simple(x.name) === simple(c.name!) && simple(x.name)) : undefined);
}
/** The old invoices were paid by transfer: a document that shows no payment mode is imported as « Virement ». */
const IMPORT_PAYMENT = "Virement";
function draftOf(r: ReadInvoice, clientId: string): Draft {
  const payment = r.payment || IMPORT_PAYMENT;
  return { ...emptyDraft(true), number: r.number, date: r.date, clientId, lines: r.lines, taxMode: r.taxMode, taxRate: r.taxMode === "ttc" ? r.taxRate : 19.25, discountRate: r.discountRate, advance: r.advance, purchaseOrder: r.purchaseOrder, reference: r.reference, payment };
}
/** What stops a draft from being saved as it is, and what only deserves a look. */
function issues(d: Data, r: ReadInvoice, twins = 0) {
  const stop: string[] = [], look = [...r.warnings], client = matchClient(d.clients.filter(c => !c.archived), r.client);
  const taken = r.number ? numberTaken(d, r.number) : undefined;
  if (taken) stop.push(taken.client ? `Déjà dans l’application (facture de ${taken.client.name}).` : `Le numéro ${r.number} a déjà servi.`);
  else if (twins > 1) stop.push(`Le numéro ${r.number} apparaît ${twins} fois dans les fichiers.`);
  if (r.date && d.closedMonths.includes(r.date.slice(0, 7))) stop.push(`${monthLabel(r.date.slice(0, 7))} est clôturé.`);
  if (r.date && r.date > todayIso()) stop.push("La date est dans le futur.");
  if (!client && r.client.name) look.push(`Nouveau client : ${r.client.name}.`);
  const t = invoiceTotals(draftOf(r, ""));
  if (r.advance > t.ttc) stop.push("L’avance dépasse le total.");
  return { stop, look, client, total: t.ttc, ready: !stop.length && !look.length && !!client, known: !!taken };
}

/** Step 1, over the Factures page: a large place to drop the files, or choose them. */
export function ImportDropDialog({ onClose, onFiles }: { onClose: () => void; onFiles: (files: File[]) => void }) {
  const [drag, setDrag] = useState(false), input = useRef<HTMLInputElement>(null);
  const take = (files: File[]) => { if (files.length) onFiles(files); };
  return <Modal title="Importer d’anciennes factures" subtitle="Des factures faites avant l’application, depuis leurs fichiers" onClose={onClose} wide>
    <div className={`cx-dropzone cx-dropzone-big${drag ? " cx-drag" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); take([...e.dataTransfer.files]); }}
      onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }} aria-label="Déposer ou choisir les fichiers">
      <span className="cx-drop-icon" aria-hidden="true"><FileUp size={34} /></span>
      <p className="cx-drop-title">Glissez vos fichiers ici</p>
      <p className="cx-drop-sub">ou</p>
      <Button kind="primary" onClick={() => input.current?.click()}>Choisir les fichiers</Button>
      <span className="cx-drop-kinds"><span className="cx-file-badge cx-file-pdf">PDF</span><span className="cx-file-badge cx-file-doc">Word .docx</span></span>
      <input ref={input} type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden onChange={e => take([...(e.target.files ?? [])])} onClick={e => e.stopPropagation()} />
    </div>
    <ol className="cx-drop-steps">
      <li><strong>1. Déposez</strong> un ou plusieurs fichiers. Un fichier peut contenir plusieurs factures (une par page, par exemple).</li>
      <li><strong>2. L’application les lit</strong> sur cet ordinateur : numéro, date, client, articles, total. Les fichiers ne sont ni gardés ni envoyés.</li>
      <li><strong>3. Vous vérifiez</strong>, puis vous enregistrez. Elles deviennent des factures « Ancienne », sans validation de la Direction.</li>
    </ol>
  </Modal>;
}

const pct = (j: Job) => j.state === "done" ? 100 : j.pages ? Math.round((j.page ?? 0) / j.pages * 100) : 0;
function FileCard({ j }: { j: Job }) {
  return <div className={`cx-file-card cx-file-${j.state}`}>
    <span className={`cx-file-badge ${j.kind === "pdf" ? "cx-file-pdf" : "cx-file-doc"}`}>{j.kind === "pdf" ? "PDF" : "DOCX"}</span>
    <span className="cx-file-main"><strong>{j.name}</strong>
      <small>{j.state === "waiting" ? "En attente…" : j.state === "reading" ? (j.pages ? `Lecture de la page ${j.page} sur ${j.pages}…` : "Lecture…") : j.state === "failed" ? j.error : `${j.found} facture${j.found > 1 ? "s" : ""} trouvée${j.found > 1 ? "s" : ""}`}</small>
      {j.state !== "failed" && <i className="cx-file-bar" aria-hidden="true"><b style={{ width: `${pct(j)}%` }} /></i>}</span>
    <span className="cx-file-state" aria-hidden="true">{j.state === "done" ? <Check size={18} /> : j.state === "reading" ? <Loader2 size={18} className="cx-spin" /> : null}</span>
  </div>;
}

type Filter = "all" | "ready" | "check" | "saved";
/** Steps 2 and 3: reading, then checking and saving. */
export function ImportPdf({ by, onBack, onOpen }: { by: string; onBack: () => void; onOpen: (invoiceId: string) => void }) {
  const d = useData(), [jobs, setJobsState] = useState<Job[]>(keptJobs), [items, setItemsState] = useState<Item[]>(keptItems);
  const [check, setCheck] = useState<Item | null>(null), [bulk, setBulk] = useState(false), [drop, setDrop] = useState(false), [filter, setFilter] = useState<Filter>("all"), [newClient, setNewClient] = useState<Client | null>(null);
  const [cancelAll, setCancelAll] = useState(false);
  const setJobs = (f: (x: Job[]) => Job[]) => setJobsState(() => (keptJobs = f(keptJobs)));
  const setItems = (f: (x: Item[]) => Item[]) => setItemsState(() => (keptItems = f(keptItems)));
  const job = (key: string, p: Partial<Job>) => setJobs(x => x.map(j => j.key === key ? { ...j, ...p } : j));
  const update = (key: string, p: Partial<Item>) => setItems(x => x.map(i => i.key === key ? { ...i, ...p } : i));
  const busy = useRef(false);

  // Files are read one after the other: an old office computer stays responsive, even with a large batch.
  async function readWaiting() {
    if (busy.current) return; busy.current = true;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift()) {
        const { key, file } = next, kind = kindOf(file)!, mine = batch;
        job(key, { state: "reading" });
        try {
          const data = await file.arrayBuffer();
          const lines = kind === "pdf" ? await pdfLines(data, (page, pages) => job(key, { page, pages })) : await wordLines(data);
          if (mine !== batch) continue;
          const found = splitInvoices(lines).map(g => ({ page: g[0]?.page ?? 1, read: readInvoice(g) })).filter(x => x.read.number || x.read.date || x.read.lines.length);
          if (!found.length) { job(key, { state: "failed", error: kind === "pdf" ? "Aucune facture lisible : c’est peut-être un scan (une image). Saisissez-la avec « Ajouter une ancienne facture »." : "Aucune facture trouvée dans ce document." }); continue; }
          setItems(x => [...x, ...found.map(f => ({ key: crypto.randomUUID(), file: file.name, page: f.page, state: "read" as const, read: f.read }))]);
          job(key, { state: "done", found: found.length });
        } catch (e) {
          job(key, { state: "failed", error: /password|encrypt/i.test(String(e)) ? "Fichier protégé par un mot de passe." : kind === "pdf" ? "Ce fichier n’a pas pu être lu comme un PDF." : "Ce fichier n’a pas pu être lu comme un document Word (.docx). Un ancien .doc doit d’abord être enregistré en .docx ou en PDF." });
        }
      }
    } finally { busy.current = false; }
  }
  useEffect(() => { void readWaiting(); });

  /** Saved as they are: only drafts with nothing to look at, and a client already in the app. */
  function saveReady(list: Item[]) {
    let n = 0;
    for (const it of list) {
      const cur = getData(), x = issues(cur, it.read);
      if (!x.ready || !x.client) continue;
      const invoice = newInvoiceRecord(cur, draftOf(it.read, x.client.id), x.client, by, { legacy: true });
      commit(by, y => ({ invoices: [...y.invoices, invoice] }), { text: `Ancienne facture ${invoice.number} du ${dateFr(invoice.date)} reprise de son fichier, ${money(invoiceTotals(invoice).ttc)}`, clientId: invoice.client.id, invoiceId: invoice.id });
      update(it.key, { state: "saved", invoiceId: invoice.id, number: invoice.number }); n++;
    }
    toast(n ? `${n} ancienne(s) facture(s) enregistrée(s).` : "Rien à enregistrer.");
  }
  /** Back to an empty import: files and invoices not saved leave this page. What was saved stays in the app. */
  function discard() {
    batch++; waiting.length = 0;
    const kept = keptItems.filter(i => i.state === "saved").length;
    setJobs(() => []); setItems(() => []); setFilter("all"); setCancelAll(false);
    toast(kept ? `Import annulé. ${kept === 1 ? "La facture déjà enregistrée reste" : `Les ${kept} factures déjà enregistrées restent`} dans l’application.` : "Import annulé.");
  }

  if (check) {
    const r = check.read, client = matchClient(d.clients.filter(c => !c.archived), r.client), x = issues(d, r);
    return <Composer key={check.key} legacy by={by} initial={draftOf(r, client?.id ?? "")} readClient={client ? undefined : r.client} source={{ file: `${check.file}${check.page > 1 ? `, page ${check.page}` : ""}`, warnings: [...x.stop, ...r.warnings] }} startStep={client && !x.stop.length && r.number && r.date ? 3 : 0}
      onDone={id => { update(check.key, { state: "saved", invoiceId: id, number: getData().invoices.find(i => i.id === id)?.number }); setCheck(null); }} onCancel={() => setCheck(null)} />;
  }

  const counts = new Map<string, number>();
  for (const it of items) if (it.state === "read" && it.read.number) counts.set(it.read.number.toLowerCase(), (counts.get(it.read.number.toLowerCase()) ?? 0) + 1);
  const rows = items.map(it => ({ it, x: issues(d, it.read, counts.get(it.read.number.toLowerCase())) }));
  const open = rows.filter(r => r.it.state === "read"), ready = open.filter(r => r.x.ready), toCheck = open.filter(r => !r.x.ready), saved = rows.filter(r => r.it.state === "saved");
  // Clients read in the files that are not in the app yet: created once, for all their invoices.
  const unknown = new Map<string, { client: Partial<Client>; n: number }>();
  for (const r of open) if (!r.x.client && r.it.read.client.name) { const k = simple(r.it.read.client.name); const u = unknown.get(k); unknown.set(k, { client: u?.client ?? r.it.read.client, n: (u?.n ?? 0) + 1 }); }
  const reading = jobs.some(j => j.state === "waiting" || j.state === "reading");
  const shown = rows.filter(r => filter === "all" ? true : filter === "ready" ? r.it.state === "read" && r.x.ready : filter === "check" ? r.it.state === "read" && !r.x.ready : r.it.state === "saved");
  const step = !jobs.length ? 1 : reading ? 2 : 3;

  return <div className="cx-page cx-import">
    <PageHead back={{ label: "Factures", onClick: onBack }} title="Importer d’anciennes factures" sub="PDF ou Word, une ou plusieurs factures par fichier"
      actions={<>{jobs.length > 0 && <Button kind="quiet" onClick={() => setCancelAll(true)} icon={<X size={16} aria-hidden="true" />}>Tout annuler</Button>}<Button onClick={() => setDrop(true)} icon={<FileUp size={16} aria-hidden="true" />}>Ajouter des fichiers</Button>{ready.length > 0 && !reading && <Button kind="primary" onClick={() => setBulk(true)}>{ready.length === 1 ? "Enregistrer la facture prête" : `Enregistrer les ${ready.length} factures prêtes`}</Button>}</>} />
    <ol className="cx-import-steps" aria-label="Étapes">{["Déposer les fichiers", "Lecture", "Vérifier et enregistrer"].map((t, i) => <li key={t} className={i + 1 < step ? "cx-done" : i + 1 === step ? "cx-now" : ""}><span>{i + 1 < step ? <Check size={14} strokeWidth={3} aria-label="fait" /> : i + 1}</span>{t}</li>)}</ol>

    {!jobs.length && <button type="button" className="cx-dropzone cx-dropzone-big" onClick={() => setDrop(true)}><span className="cx-drop-icon" aria-hidden="true"><FileUp size={34} /></span><span className="cx-drop-title">Choisir ou déposer les fichiers</span><span className="cx-drop-kinds"><span className="cx-file-badge cx-file-pdf">PDF</span><span className="cx-file-badge cx-file-doc">Word .docx</span></span></button>}
    {jobs.length > 0 && <section className="cx-file-cards" aria-label="Fichiers">{jobs.map(j => <FileCard key={j.key} j={j} />)}</section>}

    {items.length > 0 && <>
      <dl className="cx-import-tiles">
        <div><dt>Trouvées</dt><dd>{items.length}</dd></div>
        <div className="cx-tone-good"><dt>Prêtes</dt><dd>{ready.length}</dd></div>
        <div className="cx-tone-warn"><dt>À vérifier</dt><dd>{toCheck.length}</dd></div>
        <div><dt>Enregistrées</dt><dd>{saved.length}</dd></div>
      </dl>
      {unknown.size > 0 && <Notice tone="warn" title="Nouveaux clients">
        Ces clients ne sont pas encore dans l’application. Créez-les une fois : toutes leurs factures deviennent prêtes.
        <span className="cx-new-clients">{[...unknown.values()].map(u => <Button key={u.client.name} size="sm" icon={<UserPlus size={15} aria-hidden="true" />} onClick={() => setNewClient({ ...emptyClient(), ...u.client } as Client)}>Créer {u.client.name} ({u.n} facture{u.n > 1 ? "s" : ""})</Button>)}</span>
      </Notice>}
      <div className="cx-seg" role="group" aria-label="Factures à montrer">{([["all", `Toutes (${items.length})`], ["ready", `Prêtes (${ready.length})`], ["check", `À vérifier (${toCheck.length})`], ["saved", `Enregistrées (${saved.length})`]] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <div className="cx-card cx-card-flush cx-list">{shown.map(({ it, x }) => {
        const r = it.read, where = `${it.file}${it.page > 1 || jobs.find(j => j.name === it.file)?.found !== 1 ? ` · page ${it.page}` : ""}`;
        if (it.state === "saved") return <div key={it.key} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{it.number} · {x.client?.name ?? r.client.name} · {money(x.total)}</strong><small>{where}</small></span><span className="cx-list-actions"><span className="cx-chip cx-tone-good"><Check size={12} aria-hidden="true" /> Enregistrée</span>{it.invoiceId && <button type="button" className="cx-text-btn" onClick={() => onOpen(it.invoiceId!)}>Ouvrir</button>}</span></div>;
        if (it.state === "skipped") return <div key={it.key} className="cx-list-row cx-static cx-cancelled"><span className="cx-list-main"><strong>{r.number || "Numéro ?"} · {r.client.name ?? "Client ?"}</strong><small>{where} · ignorée</small></span><span className="cx-list-actions"><button type="button" className="cx-text-btn" onClick={() => update(it.key, { state: "read" })}>Reprendre</button></span></div>;
        return <div key={it.key} className="cx-list-row cx-static">
          <span className="cx-list-main"><strong>{r.number || "Numéro ?"} · {x.client?.name ?? r.client.name ?? "Client ?"} · {money(x.total)}</strong>
            <small>{r.date ? dateFr(r.date) : "date ?"}{r.reference ? ` · réf. ${r.reference}` : ""} · {r.lines.length} article{r.lines.length > 1 ? "s" : ""} · {r.taxMode === "ttc" ? "TTC" : "hors taxe"} · <FileText size={11} aria-hidden="true" /> {where}</small>
            {x.stop.map(s => <small key={s} className="cx-bad-text">{s}</small>)}{x.look.map(s => <small key={s} className="cx-warn-text">{s}</small>)}</span>
          <span className="cx-list-actions">{x.ready ? <span className="cx-chip cx-tone-good">Prête</span> : x.known ? <span className="cx-chip">Déjà présente</span> : <span className="cx-chip cx-tone-warn">À vérifier</span>}
            {!x.known && <Button size="sm" kind={x.ready ? "secondary" : "primary"} onClick={() => setCheck(it)}>Vérifier</Button>}<button type="button" className="cx-text-btn" onClick={() => update(it.key, { state: "skipped" })}>Ignorer</button></span>
        </div>; })}
        {!shown.length && <p className="cx-fold-note">Rien dans cette liste.</p>}</div>
    </>}
    {drop && <ImportDropDialog onClose={() => setDrop(false)} onFiles={files => { const refused = queueFiles(files); setDrop(false); setJobsState(keptJobs); if (refused.length) toast(`Ignoré : ${refused.join(", ")} (seuls les PDF et les Word .docx sont lus).`, "warn"); }} />}
    {newClient && <ClientForm client={newClient} by={by} onClose={() => setNewClient(null)} onSaved={() => setNewClient(null)} />}
    {cancelAll && <Confirm title="Tout annuler ?" confirm="Tout annuler" cancel="Continuer l’import" onClose={() => setCancelAll(false)} onConfirm={discard}>
      <p>Les fichiers déposés et les factures lues mais pas encore enregistrées quittent cette page{reading ? ", et la lecture en cours s’arrête" : ""}. Rien n’est ajouté à l’application.</p>
      {saved.length > 0 && <p>{saved.length === 1 ? "La facture déjà enregistrée reste" : `Les ${saved.length} factures déjà enregistrées restent`} dans l’application.</p>}
    </Confirm>}
    {bulk && <Confirm title={ready.length === 1 ? "Enregistrer la facture prête ?" : `Enregistrer les ${ready.length} factures prêtes ?`} confirm="Enregistrer" cancel="Pas encore" onClose={() => setBulk(false)} onConfirm={() => { setBulk(false); saveReady(ready.map(r => r.it)); }}>
      <p>Seules les factures « Prête » (rien à regarder, client déjà dans l’application) sont enregistrées telles qu’elles ont été lues : numéro, date, articles et total identiques au fichier. Les autres restent à vérifier une par une.</p>
    </Confirm>}
  </div>;
}
