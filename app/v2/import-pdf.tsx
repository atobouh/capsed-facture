/** Old invoices from their PDFs, in batches (Facturation).
 *  Each PDF is read on this computer, turned into an invoice draft, and let go: the PDF is never kept or sent.
 *  Each draft is checked by the person importing, then saved as an old invoice (« Ancienne »), with its own number and date.
 *  Old invoices need no validation by the Direction. */
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import Composer, { emptyDraft, newInvoiceRecord, numberTaken } from "./composer";
import type { Draft } from "./composer";
import { Button, Confirm, Empty, Notice, PageHead, toast } from "./ui";
import { commit, dateFr, getData, money, monthLabel, todayIso, useData } from "./store";
import type { Client, Data } from "./store";
import { pdfLines, readInvoice } from "./pdf-read";
import type { ReadInvoice } from "./pdf-read";

type Item = { key: string; file: string; state: "reading" | "read" | "unreadable" | "saved" | "skipped"; read?: ReadInvoice; error?: string; invoiceId?: string; number?: string };
// Kept while the app is open, so going to an invoice and back does not lose the batch. Only the text read is kept, never the PDF.
let kept: Item[] = [];
const simple = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(sarl|sa|suarl|sas|ets|etablissements|ste|societe)\b/g, "").trim();
/** The client already in the app: same NIU, or the same name (accents, case and legal form aside). */
export function matchClient(clients: Client[], c: Partial<Client>) {
  const niu = c.niu?.replace(/\s/g, "").toLowerCase();
  return (niu && clients.find(x => x.niu && x.niu.replace(/\s/g, "").toLowerCase() === niu)) || (c.name ? clients.find(x => simple(x.name) === simple(c.name!) && simple(x.name)) : undefined);
}
function draftOf(r: ReadInvoice, clientId: string): Draft {
  return { ...emptyDraft(true), number: r.number, date: r.date, clientId, lines: r.lines, taxMode: r.taxMode, taxRate: r.taxMode === "ttc" ? r.taxRate : 19.25, discountRate: r.discountRate, advance: r.advance, purchaseOrder: r.purchaseOrder, ...(r.payment ? { payment: r.payment } : {}) };
}
/** What stops a draft from being saved as it is, and what only deserves a look. */
function issues(d: Data, r: ReadInvoice) {
  const stop: string[] = [], look = [...r.warnings], client = matchClient(d.clients.filter(c => !c.archived), r.client);
  const taken = r.number ? numberTaken(d, r.number) : undefined;
  if (taken) stop.push(taken.client ? `Le numéro ${r.number} existe déjà (facture de ${taken.client.name}).` : `Le numéro ${r.number} a déjà servi.`);
  if (r.date && d.closedMonths.includes(r.date.slice(0, 7))) stop.push(`${monthLabel(r.date.slice(0, 7))} est clôturé.`);
  if (r.date && r.date > todayIso()) stop.push("La date est dans le futur.");
  if (!client && r.client.name) look.push(`Nouveau client : ${r.client.name}.`);
  const t = invoiceTotals(draftOf(r, ""));
  if (r.advance > t.ttc) stop.push("L’avance dépasse le total.");
  return { stop, look, client, total: t.ttc };
}

export function ImportPdf({ by, onBack, onOpen }: { by: string; onBack: () => void; onOpen: (invoiceId: string) => void }) {
  const d = useData(), [items, setItemsState] = useState<Item[]>(kept), [check, setCheck] = useState<Item | null>(null), [bulk, setBulk] = useState(false), [drag, setDrag] = useState(false), input = useRef<HTMLInputElement>(null);
  const setItems = (f: (x: Item[]) => Item[]) => setItemsState(x => (kept = f(x)));
  const update = (key: string, p: Partial<Item>) => setItems(x => x.map(i => i.key === key ? { ...i, ...p } : i));

  async function add(files: File[]) {
    const pdfs = files.filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return toast("Choisissez des fichiers PDF.", "warn");
    const fresh = pdfs.map(f => ({ key: crypto.randomUUID(), file: f.name, state: "reading" as const }));
    setItems(x => [...x, ...fresh]);
    // One after the other: an old office computer stays responsive, even with a large batch.
    for (const [n, f] of pdfs.entries()) {
      try {
        const read = readInvoice(await pdfLines(await f.arrayBuffer()));
        const empty = !read.number && !read.date && !read.lines.length;
        update(fresh[n].key, empty ? { state: "unreadable", error: "Aucun texte de facture trouvé : c’est peut-être un scan (une image). Saisissez-la avec « Ajouter une ancienne facture »." } : { state: "read", read });
      } catch (e) {
        update(fresh[n].key, { state: "unreadable", error: /password|encrypt/i.test(String(e)) ? "PDF protégé par un mot de passe." : "Ce fichier n’a pas pu être lu comme un PDF." });
      }
    }
    if (input.current) input.current.value = "";
  }
  /** Saved as it is: only drafts with nothing to look at, and a client already in the app. */
  function saveReady(list: Item[]) {
    let n = 0;
    for (const it of list) {
      const cur = getData(), r = it.read!, x = issues(cur, r);
      if (x.stop.length || x.look.length || !x.client) continue;
      const invoice = newInvoiceRecord(cur, draftOf(r, x.client.id), x.client, by, { legacy: true });
      commit(by, y => ({ invoices: [...y.invoices, invoice] }), { text: `Ancienne facture ${invoice.number} du ${dateFr(invoice.date)} reprise de son PDF, ${money(invoiceTotals(invoice).ttc)}`, clientId: invoice.client.id, invoiceId: invoice.id });
      update(it.key, { state: "saved", invoiceId: invoice.id, number: invoice.number }); n++;
    }
    toast(n ? `${n} ancienne(s) facture(s) enregistrée(s).` : "Rien à enregistrer.");
  }

  if (check?.read) {
    const r = check.read, client = matchClient(d.clients.filter(c => !c.archived), r.client), x = issues(d, r);
    return <Composer key={check.key} legacy by={by} initial={draftOf(r, client?.id ?? "")} readClient={client ? undefined : r.client} source={{ file: check.file, warnings: [...x.stop, ...r.warnings] }} startStep={client && !x.stop.length && r.number && r.date ? 3 : 0}
      onDone={id => { update(check.key, { state: "saved", invoiceId: id, number: getData().invoices.find(i => i.id === id)?.number }); setCheck(null); }} onCancel={() => setCheck(null)} />;
  }
  const open = items.filter(i => i.state === "read"), ready = open.filter(i => { const x = issues(d, i.read!); return !x.stop.length && !x.look.length && x.client; });
  const done = items.filter(i => i.state === "saved").length;
  return <div className="cx-page">
    <PageHead back={{ label: "Factures", onClick: onBack }} title="Importer d’anciennes factures" sub="Depuis leurs PDF, en une fois"
      actions={<>{items.length > 0 && <Button kind="quiet" onClick={() => setItems(x => x.filter(i => i.state === "read" || i.state === "reading"))}>Retirer les lignes terminées</Button>}{ready.length > 0 && <Button kind="primary" onClick={() => setBulk(true)}>{ready.length === 1 ? "Enregistrer la facture prête" : `Enregistrer les ${ready.length} factures prêtes`}</Button>}</>} />
    <Notice title="Comment ça marche">Choisissez les PDF des factures faites avant l’application (créés sur ordinateur, pas scannés). Chaque PDF est lu sur cet ordinateur, puis oublié : il n’est ni gardé ni envoyé. Vérifiez chaque facture, puis enregistrez-la : elle devient une « Ancienne » facture avec son numéro et sa date d’origine. La Direction n’a pas à les valider.</Notice>
    <div className={`cx-dropzone${drag ? " cx-drag" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void add([...e.dataTransfer.files]); }}>
      <FileUp size={28} aria-hidden="true" />
      <p><strong>Déposez les PDF ici</strong> ou</p>
      <Button kind="primary" onClick={() => input.current?.click()}>Choisir les PDF</Button>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => void add([...(e.target.files ?? [])])} />
    </div>
    {items.length ? <div className="cx-card cx-card-flush cx-list">{items.map(it => {
      if (it.state === "reading") return <div key={it.key} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{it.file}</strong><small>Lecture…</small></span></div>;
      if (it.state === "unreadable") return <div key={it.key} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{it.file}</strong><small className="cx-bad-text">{it.error}</small></span><span className="cx-list-actions"><button type="button" className="cx-text-btn" onClick={() => setItems(x => x.filter(i => i.key !== it.key))}>Retirer</button></span></div>;
      if (it.state === "saved") return <div key={it.key} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{it.file}</strong><small>Enregistrée : facture {it.number}</small></span><span className="cx-list-actions"><span className="cx-chip cx-tone-good">Enregistrée</span>{it.invoiceId && <button type="button" className="cx-text-btn" onClick={() => onOpen(it.invoiceId!)}>Ouvrir</button>}</span></div>;
      if (it.state === "skipped") return <div key={it.key} className="cx-list-row cx-static cx-cancelled"><span className="cx-list-main"><strong>{it.file}</strong><small>Ignorée</small></span><span className="cx-list-actions"><button type="button" className="cx-text-btn" onClick={() => update(it.key, { state: "read" })}>Reprendre</button></span></div>;
      const r = it.read!, x = issues(d, r);
      return <div key={it.key} className="cx-list-row cx-static">
        <span className="cx-list-main"><strong>{r.number || "Numéro ?"} · {x.client?.name ?? r.client.name ?? "Client ?"} · {money(x.total)}</strong>
          <small>{it.file} · {r.date ? dateFr(r.date) : "date ?"} · {r.lines.length} article(s){r.taxMode === "ttc" ? " · TTC" : " · HT"}</small>
          {x.stop.map(s => <small key={s} className="cx-bad-text">{s}</small>)}{x.look.map(s => <small key={s} className="cx-warn-text">{s}</small>)}</span>
        <span className="cx-list-actions">{!x.stop.length && !x.look.length && x.client ? <span className="cx-chip cx-tone-good">Prête</span> : <span className="cx-chip cx-tone-warn">À vérifier</span>}
          <Button size="sm" kind="primary" onClick={() => setCheck(it)}>Vérifier</Button><button type="button" className="cx-text-btn" onClick={() => update(it.key, { state: "skipped" })}>Ignorer</button></span>
      </div>; })}</div>
      : <div className="cx-card"><Empty title="Aucun PDF pour l’instant.">Vous pouvez en choisir plusieurs à la fois. {done ? "" : "Rien n’est enregistré tant que vous ne l’avez pas décidé."}</Empty></div>}
    {bulk && <Confirm title={ready.length === 1 ? "Enregistrer la facture prête ?" : `Enregistrer les ${ready.length} factures prêtes ?`} confirm="Enregistrer" cancel="Pas encore" onClose={() => setBulk(false)} onConfirm={() => { setBulk(false); saveReady(ready); }}>
      <p>Seules les factures « Prête » (sans remarque, client déjà dans l’application) sont enregistrées telles qu’elles ont été lues : numéro, date, articles et totaux identiques au PDF. Les autres restent à vérifier une par une.</p>
    </Confirm>}
  </div>;
}
