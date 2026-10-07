/** Situation de facturation: every invoice issued over a period, the TTC ones on one side, the hors taxe ones on the other,
 *  each with its history and its total. Invoices as issued: credit notes and payments are not taken into account here.
 *  For the Direction (Situation, « Les factures ») and for Facturation (Factures, « ⋯ »). */
import { useLayoutEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { invoiceTotals, printedAmount } from "../invoice-math";
import { downloadExcel } from "../receipt-export";
import { OFFICIAL_FOOTER } from "../invoice-brand";
import { DocumentBackground, DocumentFooter } from "../invoice-paper";
import { periodTitle } from "../statement-period";
import type { StatementPeriod } from "../statement-period";
import { Button, DateInput, FitPaper, MoreMenu, Notice, PageHead } from "./ui";
import { dateFr, dateValid, money, todayIso, useData } from "./store";
import type { Data, Invoice } from "./store";

export type ReportKind = "both" | "ttc" | "ht";
const KIND_LABEL: Record<ReportKind, string> = { both: "Factures TTC et hors taxe", ttc: "Factures TTC", ht: "Factures hors taxe" };
type Row = { id: string; date: string; number: string; client: string; legacy: boolean; ht: number; tax: number; ttc: number };
const rowOf = (i: Invoice): Row => { const t = invoiceTotals(i); return { id: i.id, date: i.date, number: i.number, client: i.client.name, legacy: !!i.legacy, ht: t.ht, tax: t.tax, ttc: t.ttc }; };
const sum = (rows: Row[]) => rows.reduce((a, r) => ({ ht: a.ht + r.ht, tax: a.tax + r.tax, ttc: a.ttc + r.ttc }), { ht: 0, tax: 0, ttc: 0 });

export function reportData(invoices: Invoice[], p: StatementPeriod) {
  const inPeriod = invoices.filter(i => i.date >= p.from && i.date <= p.to).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const ttc = inPeriod.filter(i => invoiceTotals(i).taxMode === "ttc").map(rowOf), ht = inPeriod.filter(i => invoiceTotals(i).taxMode !== "ttc").map(rowOf);
  return { ttc, ht, totalTtc: sum(ttc), totalHt: sum(ht) };
}
const title = (p: StatementPeriod, kind: ReportKind) => `${periodTitle(p)} · ${KIND_LABEL[kind]}`;

function exportRows(invoices: Invoice[], p: StatementPeriod, kind: ReportKind) {
  const r = reportData(invoices, p), out: (string | number)[][] = [];
  const line = (x: Row, type: string) => [x.date, x.number + (x.legacy ? " (ancienne)" : ""), type, x.client, x.ht, x.tax, x.ttc];
  if (kind !== "ht") out.push(...r.ttc.map(x => line(x, "TTC")));
  if (kind !== "ttc") out.push(...r.ht.map(x => line(x, "Hors taxe")));
  const totals: (string | number)[][] = [];
  if (kind !== "ht") totals.push([`Total des factures TTC (${r.ttc.length})`, "", "", "", r.totalTtc.ht, r.totalTtc.tax, r.totalTtc.ttc]);
  if (kind !== "ttc") totals.push([`Total des factures hors taxe (${r.ht.length})`, "", "", "", r.totalHt.ht, 0, r.totalHt.ttc]);
  if (kind === "both") totals.push(["Total facturé", "", "", "", r.totalTtc.ht + r.totalHt.ht, r.totalTtc.tax, r.totalTtc.ttc + r.totalHt.ttc]);
  return { head: ["Date", "N° facture", "Type", "Client", "Montant HT", "TVA", "Total facturé"], out, totals };
}
function downloadCsv(invoices: Invoice[], p: StatementPeriod, kind: ReportKind) {
  const { head, out, totals } = exportRows(invoices, p, kind);
  const csv = [[title(p, kind)], head, ...out, [], ...totals].map(row => row.map(v => { const raw = String(v ?? ""), safe = typeof v === "string" && /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw; return '"' + safe.replaceAll('"', '""') + '"'; }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
  a.href = url; a.download = `situation-factures-${kind}-${p.from}-${p.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadXlsx(invoices: Invoice[], p: StatementPeriod, kind: ReportKind) {
  const { head, out, totals } = exportRows(invoices, p, kind);
  downloadExcel([[(invoices[0]?.company?.name || "CAPSED SUARL") + " · " + title(p, kind)], head, ...out, [], ...totals, [], ["La Direction."], ["Merci pour votre confiance."], ...OFFICIAL_FOOTER.map(l => [l])], `situation-factures-${kind}-${p.from}-${p.to}.xlsx`);
}

/** The A4 pages, on the CAPSED letterhead: one block per kind, each with its subtotal, then the grand total. */
function ReportPaper({ invoices, period, kind, format }: { invoices: Invoice[]; period: StatementPeriod; kind: ReportKind; format: Data["format"] }) {
  const r = reportData(invoices, period), m = printedAmount;
  type Block = { kind: "ttc" | "ht"; rows: Row[]; total: ReturnType<typeof sum>; first: boolean; last: boolean };
  const blocks: ("ttc" | "ht")[] = kind === "both" ? ["ttc", "ht"] : [kind];
  const table = (b: Block) => <section key={b.kind + b.first} className="statement-report-block">
    <h2 className="statement-report-title">{b.kind === "ttc" ? "Factures TTC" : "Factures hors taxe"}{!b.first ? " (suite)" : ` · ${(b.kind === "ttc" ? r.ttc : r.ht).length} facture(s)`}</h2>
    <table className="statement-table statement-report-table"><thead><tr><th>Date</th><th>N° facture</th><th>Client</th><th>Montant HT</th>{b.kind === "ttc" && <><th>TVA</th><th>Total TTC</th></>}</tr></thead>
      <tbody>{b.rows.map(x => <tr key={x.id} data-id={x.id}><td>{new Date(x.date + "T12:00:00").toLocaleDateString("fr-FR")}</td><td>{x.number}{x.legacy && <small>Ancienne</small>}</td><td>{x.client}</td><td>{m(x.ht)}</td>{b.kind === "ttc" && <><td>{m(x.tax)}</td><td>{m(x.ttc)}</td></>}</tr>)}
        {!b.rows.length && <tr><td colSpan={b.kind === "ttc" ? 6 : 4}>Aucune facture {b.kind === "ttc" ? "TTC" : "hors taxe"} sur la période.</td></tr>}
        {b.last && <tr className="statement-report-subtotal"><td colSpan={3}>Total des factures {b.kind === "ttc" ? "TTC" : "hors taxe"}</td><td>{m(b.total.ht)}</td>{b.kind === "ttc" && <><td>{m(b.total.tax)}</td><td>{m(b.total.ttc)}</td></>}</tr>}</tbody></table>
  </section>;
  const pageHead = (first: boolean) => <>
      <div className="receipt-title"><h1>SITUATION DE FACTURATION</h1></div>
      <div className="statement-identification"><div><strong>{KIND_LABEL[kind]}</strong></div><span>{periodTitle(period)}</span></div>
      {first && <div className="statement-summary" style={{ gridTemplateColumns: `repeat(${kind === "both" ? 3 : 2},1fr)` }}>
        {kind !== "ht" && <div><span>Factures TTC ({r.ttc.length})</span><strong>{m(r.totalTtc.ttc)}</strong></div>}
        {kind !== "ttc" && <div><span>Factures hors taxe ({r.ht.length})</span><strong>{m(r.totalHt.ht)}</strong></div>}
        {kind === "both" && <div><span>Total facturé</span><strong>{m(r.totalTtc.ttc + r.totalHt.ht)}</strong></div>}
      </div>}
  </>;
  const closing = <div className="statement-closing" data-m="closing">
        {kind === "both" && <p>Total facturé sur la période : <strong>{m(r.totalTtc.ttc + r.totalHt.ht)}</strong><small>Dont factures TTC {m(r.totalTtc.ttc)} (HT {m(r.totalTtc.ht)}, TVA {m(r.totalTtc.tax)}) et factures hors taxe {m(r.totalHt.ht)}.</small></p>}
        <p>Factures telles qu’émises, par date de facture. Les avoirs et les paiements n’y sont pas déduits.</p>
        <div className="receipt-signature">La Direction.</div>
      </div>;
  // Every row is measured in a hidden copy first (a long client name takes two lines), then pages are filled by height,
  // in px: content from 172 down to the footer (995). A block cut by a page starts again with its headings.
  const measure = useRef<HTMLDivElement>(null), [g, setG] = useState<{ h1: number; h2: number; head: number; sub: number; closing: number; rows: Record<string, number> } | null>(null);
  useLayoutEffect(() => {
    const el = measure.current; if (!el) return;
    const q = (sel: string) => el.querySelector(sel) as HTMLElement | null, sec = q(".statement-report-block"), tbl = sec?.querySelector("table") as HTMLElement | null, th = tbl?.querySelector("thead") as HTMLElement | null;
    const rows: Record<string, number> = {}; el.querySelectorAll<HTMLElement>("tr[data-id]").forEach(t => { rows[t.dataset.id!] = t.offsetHeight; });
    const next = { h1: q("[data-m=h1]")?.offsetHeight ?? 190, h2: q("[data-m=h2]")?.offsetHeight ?? 90, head: sec && tbl && th ? tbl.offsetTop - sec.offsetTop + th.offsetTop + th.offsetHeight + 18 : 80, sub: q(".statement-report-subtotal")?.offsetHeight ?? 40, closing: q("[data-m=closing]")?.offsetHeight ?? 170, rows };
    setG(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
  }, [invoices, period.from, period.to, kind]);
  const FOOTER = 995, rowH = (x: Row) => g?.rows[x.id] ?? (x.legacy ? 52 : 38), HEAD = g?.head ?? 80, SUB = g?.sub ?? 40;
  const pages: Block[][] = [[]];
  let room = FOOTER - 172 - (g?.h1 ?? 190);
  for (const k of blocks) {
    const rows = k === "ttc" ? r.ttc : r.ht, total = k === "ttc" ? r.totalTtc : r.totalHt;
    let start = 0;
    do {
      if (room < HEAD + SUB + 40) { pages.push([]); room = FOOTER - 172 - (g?.h2 ?? 90); }
      room -= HEAD;
      const take: Row[] = [];
      while (start + take.length < rows.length) { const h = rowH(rows[start + take.length]), lastOne = start + take.length === rows.length - 1; if (h + (lastOne ? SUB : 0) > room && take.length) break; take.push(rows[start + take.length]); room -= h; }
      const last = start + take.length >= rows.length;
      if (last) room -= SUB;
      pages.at(-1)!.push({ kind: k, rows: take, total, first: start === 0, last });
      start += take.length;
    } while (start < rows.length);
  }
  // The closing never stands alone on a page: the last line of the last block goes with it (headings and subtotal too).
  if (room < (g?.closing ?? 170)) {
    const lastBlock = pages.at(-1)!.at(-1);
    if (lastBlock && lastBlock.rows.length > 1) { const moved = lastBlock.rows.pop()!; lastBlock.last = false; pages.push([{ ...lastBlock, rows: [moved], first: false, last: true }]); }
    else pages.push([]);
  }
  return <div className="document-pages receipt-pages"><div className="document-measurement receipt-measurement" ref={measure} aria-hidden="true"><div data-m="h1">{pageHead(true)}</div><div data-m="h2">{pageHead(false)}</div>{blocks.map(k => table({ kind: k, rows: k === "ttc" ? r.ttc : r.ht, total: k === "ttc" ? r.totalTtc : r.totalHt, first: true, last: true }))}{closing}</div>{pages.map((page, index) => <article key={index} className="document-page receipt-page statement-page" style={{ width: 794, height: 1123 }}>
    <DocumentBackground format={format} /><div className="receipt-content">
      {pageHead(index === 0)}
      {page.map(table)}
      {index === pages.length - 1 && closing}
    </div><DocumentFooter format={format} />{pages.length > 1 && <span className="receipt-page-number">Page {index + 1} / {pages.length}</span>}
  </article>)}</div>;
}

export function InvoiceReport({ data, onBack }: { data: Pick<Data, "invoices" | "format">; onBack?: () => void }) {
  const year = todayIso().slice(0, 4), [period, setPeriod] = useState<StatementPeriod>({ from: year + "-01-01", to: todayIso() }), [kind, setKind] = useState<ReportKind>("both");
  const valid = dateValid(period.from) && dateValid(period.to) && period.from <= period.to, r = valid ? reportData(data.invoices, period) : null;
  return <div className="cx-page">
    <PageHead back={onBack ? { label: "Factures", onClick: onBack } : undefined} title="Situation de facturation" sub={valid ? title(period, kind) : undefined}
      actions={valid ? <><MoreMenu label="Exporter" items={[{ label: "Excel", onClick: () => downloadXlsx(data.invoices, period, kind) }, { label: "CSV", onClick: () => downloadCsv(data.invoices, period, kind) }]} /><Button kind="primary" icon={<Printer size={18} aria-hidden="true" />} onClick={() => window.print()}>Imprimer</Button></> : undefined} />
    <div className="cx-toolbar cx-noprint">
      <label className="cx-month"><span>Du</span><DateInput value={period.from} onChange={v => setPeriod(p => ({ ...p, from: v }))} /></label>
      <label className="cx-month"><span>Au</span><DateInput value={period.to} min={period.from} onChange={v => setPeriod(p => ({ ...p, to: v }))} /></label>
      <div className="cx-quick"><button type="button" className="cx-pill" onClick={() => setPeriod({ from: todayIso().slice(0, 8) + "01", to: todayIso() })}>Ce mois-ci</button><button type="button" className="cx-pill" onClick={() => setPeriod({ from: year + "-01-01", to: todayIso() })}>Cette année</button></div>
    </div>
    <div className="cx-seg cx-noprint" role="group" aria-label="Factures à montrer">{(["both", "ttc", "ht"] as const).map(k => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "both" ? "Les deux" : k === "ttc" ? "Factures TTC" : "Factures hors taxe"}</button>)}</div>
    {r && <dl className="cx-strip cx-noprint" aria-label="Totaux de la période">
      {kind !== "ht" && <><div><dt>Factures TTC ({r.ttc.length})</dt><dd>{money(r.totalTtc.ttc)}</dd></div><div><dt>dont TVA</dt><dd>{money(r.totalTtc.tax)}</dd></div></>}
      {kind !== "ttc" && <div><dt>Factures hors taxe ({r.ht.length})</dt><dd>{money(r.totalHt.ht)}</dd></div>}
      {kind === "both" && <div><dt>Total facturé</dt><dd className="cx-strong">{money(r.totalTtc.ttc + r.totalHt.ht)}</dd></div>}
    </dl>}
    {valid ? <FitPaper label="Situation de facturation"><ReportPaper invoices={data.invoices} period={period} kind={kind} format={data.format} /></FitPaper> : <Notice tone="bad">La date de début doit être avant la date de fin.</Notice>}
    {r && <p className="cx-muted cx-noprint">Du {dateFr(period.from)} au {dateFr(period.to)}, par date de facture. Les avoirs et les paiements ne sont pas déduits.</p>}
  </div>;
}
/** Facturation's copy, from the office data. */
export function OfficeInvoiceReport({ onBack }: { onBack: () => void }) { const d = useData(); return <InvoiceReport data={d} onBack={onBack} />; }
