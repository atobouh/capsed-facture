import type { DocumentBlock, DocumentModel } from "./document-model";
import { formatMoney as money, interpolate, PAGE_W, PAGE_H } from "./document-model";

export function BlockContent({ block: b, invoice: i, rows, words }: { block: DocumentBlock; invoice: any; rows?: any[]; words: (n: number) => string }) {
  const ht = i.lines.reduce((s: number, l: any) => s + l.quantity * l.unitPrice, 0);
  const tax = Math.round(ht * i.taxRate / 100), ttc = Math.round(ht + tax);
  const company = i.company, client = i.client;
  switch (b.kind) {
    case "text": return <div className="doc-text">{interpolate(b.text, i)}</div>;
    case "image": return b.image ? <img className="doc-image" style={{ objectFit: b.imageFit ?? "contain" }} src={b.image} alt="Image du modèle" /> : <div className="doc-image-placeholder">Image / bannière</div>;
    case "company": return <div className="doc-company">{company.logo && <img src={company.logo} alt="Logo" />}<div><strong>{company.name}</strong><p>{company.subtitle}</p><p>{company.address} · {company.phone}</p><p>{company.email}</p></div></div>;
    case "client": return <div className="doc-party"><small>FACTURÉ À</small><strong>{client.name}</strong><p>{client.address}</p><p>{client.contact}</p><p>{client.phone} · {client.email}</p><p>NIU : {client.niu}</p><p>RCCM : {client.rc}</p></div>;
    case "reference": return <div className="doc-reference"><strong>N° {i.number}</strong><p>Le {new Date(i.date + "T12:00:00").toLocaleDateString("fr-FR")}</p><p>Référence : {i.number}</p></div>;
    case "lines": return <table className="doc-table"><thead><tr>{(b.headers ?? ["Contrat", "Désignation", "Destination", "Volume / Qté", "P.U.", "Montant"]).map((t, index) => <th key={index}>{t}</th>)}</tr></thead><tbody>{(rows ?? i.lines).map((l: any) => <tr key={l.id}><td>{l.contract || "—"}</td><td>{l.designation}</td><td>{l.destination || "—"}</td><td>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(l.quantity)}</td><td>{money(l.unitPrice)}</td><td>{money(l.quantity * l.unitPrice)}</td></tr>)}</tbody></table>;
    case "totals": return <div className="doc-totals">{[["Total HT", ht], [`TVA (${i.taxRate} %)`, tax], ["Total TTC", ttc], ["Avance reçue", i.advance], ["Reste à payer", Math.max(0, ttc - i.advance)]].map(([label, value]) => <p key={label}><span>{label}</span><strong>{money(Number(value))}</strong></p>)}</div>;
    case "payment": return <div className="doc-party"><small>{b.text || "MODE DE RÈGLEMENT"}</small><strong>{i.payment}</strong><p>{i.note}</p></div>;
    case "words": return <div>Arrêtée la présente facture à la somme de <strong>{words(ttc).toUpperCase()} FRANCS CFA.</strong></div>;
    case "footer": return <div>{b.text ? interpolate(b.text, i) : <>{company.name} · NIU : {company.niu} · RCCM : {company.rc}<br />{company.website} · {company.email}</>}</div>;
    case "signature": return <div className="doc-signature">{b.text || "La Direction"}</div>;
    case "rule": return <div className="doc-rule" />;
    case "table": return <table className="doc-table free-table"><tbody>{b.cells?.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{interpolate(cell, i)}</td>)}</tr>)}</tbody></table>;
  }
}
export function blockStyle(b: DocumentBlock) { return { left: b.x, top: b.y, width: b.w, height: b.h, fontSize: b.fontSize, color: b.color, fontWeight: b.bold ? 700 : 400, textAlign: b.align, "--block-color": b.color } as React.CSSProperties; }
export function DocumentPages({ model, invoice, words }: { model: DocumentModel; invoice: any; words: (n: number) => string }) {
  const lineBlock = model.blocks.find(b => b.kind === "lines");
  const groups: any[][] = [[]];
  if (lineBlock) {
    const font = lineBlock.fontSize;
    const fractions = [.14, .27, .15, .12, .13, .19];
    let used = 40;
    for (const row of invoice.lines) {
      const values = [row.contract || "—", row.designation, row.destination || "—", String(row.quantity), money(row.unitPrice), money(row.quantity * row.unitPrice)];
      const wrap = Math.max(...values.map((value, index) => Math.ceil(String(value).length / Math.max(1, Math.floor((lineBlock.w * fractions[index] - 12) / (font * .64))))));
      const height = Math.max(40, 20 + wrap * font * 1.35);
      if (used + height > lineBlock.h && groups[groups.length - 1].length) { groups.push([]); used = 40; }
      groups[groups.length - 1].push(row); used += height;
    }
  } else groups[0] = invoice.lines;
  const pages = groups.length;
  return <div className="document-pages">{Array.from({ length: pages }, (_, page) => <article key={page} className="document-page" style={{ width: PAGE_W, height: PAGE_H }} aria-label={`Facture ${invoice.number}, page ${page + 1}`}>
    {model.blocks.filter(b => pages === 1 || page === pages - 1 || !["totals", "words", "payment", "signature"].includes(b.kind)).map(b => <div key={b.id} className={`document-block kind-${b.kind}`} style={blockStyle(b)}><BlockContent block={b} invoice={invoice} rows={groups[page]} words={words} /></div>)}
    {pages > 1 && <span className="doc-page-number">Page {page + 1} / {pages}</span>}
  </article>)}</div>;
}
