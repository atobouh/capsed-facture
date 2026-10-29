import { OFFICIAL_FOOTER } from "./invoice-brand";
import { clientDetailLines, optionalText } from "./client-details";
import { useLayoutEffect, useRef, useState } from "react";
import { decimalLabel, invoiceTotals, lineAmount, measureName, normalizePayment, printedColumns } from "./invoice-math";
import { printedAmount as money } from "./invoice-math";
export const CAPSED_STATIONERY="capsed-letterhead.webp";
export function DocumentBackground({format}:{format:any}) {return <img className="receipt-stationery" src={CAPSED_STATIONERY} alt=""/>;}
export function DocumentFooter({format}:{format:any}) {return <footer className="receipt-official-footer"><p className="receipt-thanks">Merci pour votre confiance.</p><div className="receipt-legal-footer">{OFFICIAL_FOOTER.map((line,index)=><p key={index}>{line}</p>)}</div></footer>;}
export function modelFormat(model:any) {return {stationery:model.stationery??CAPSED_STATIONERY,banner:model.blocks?.find((b:any)=>b.kind==="image"&&b.y<200)?.image||"",footerText:model.blocks?.find((b:any)=>b.kind==="footer")?.text?.startsWith("Pied de page provisoire")?"":model.blocks?.find((b:any)=>b.kind==="footer")?.text?.trim()||"",footerImage:model.blocks?.find((b:any)=>b.kind==="image"&&b.y>1000)?.image||""};}
// The columns follow the invoice: N° contrat, Destination, N° de lot and Poids only when chosen and filled; Quantité or Volume (m³).
type Col={key:string;head:string;w:number;left?:boolean;cell:(l:any)=>any};
function columnsOf(i:any):Col[] {
 const p=printedColumns(i),cols:(Col|false)[]=[
  p.contract&&{key:"contract",head:"N° contrat",w:14,left:true,cell:l=>l.contract},
  {key:"designation",head:"Désignation",w:30,left:true,cell:l=>l.designation},
  p.destination&&{key:"destination",head:"Destination",w:14,cell:l=>l.destination},
  {key:"measure",head:measureName(i.measure),w:11,cell:l=>decimalLabel(l.quantity)},
  p.lot&&{key:"lot",head:"N° de lot",w:12,cell:l=>l.lot},
  p.weight&&{key:"weight",head:`Poids (${i.weightUnit==="t"?"t":"kg"})`,w:11,cell:l=>Number(l.weight)>0?decimalLabel(l.weight):""},
  {key:"pu",head:"P. U.",w:12,cell:l=>money(l.unitPrice)},
  {key:"amount",head:"Montant HT",w:14,cell:l=>money(lineAmount(l))},
 ];
 return cols.filter(Boolean) as Col[];
}
/** The totals line up with the table whatever its columns: labels start under Quantité / Volume, amounts sit under Montant HT. */
function totalsAlign(i:any){const cols=columnsOf(i),sum=cols.reduce((n,c)=>n+c.w,0),from=cols.findIndex(c=>c.key==="measure"),span=cols.slice(from).reduce((n,c)=>n+c.w,0),amount=cols.at(-1)!.w;
 return {width:(span/sum*100).toFixed(2)+"%",["--totals-cols" as any]:`${span-amount}fr ${amount}fr`};}
function Lines({lines,invoice}:{lines:any[];invoice:any}) {const cols=columnsOf(invoice),sum=cols.reduce((n,c)=>n+c.w,0);return <table className={"receipt-table receipt-lines"+(cols.length>6?" receipt-dense":"")}><colgroup>{cols.map(c=><col key={c.key} style={{width:(c.w/sum*100).toFixed(2)+"%"}}/>)}</colgroup><thead><tr>{cols.map(c=><th key={c.key} className={c.left?"receipt-left":undefined}>{c.head}</th>)}</tr></thead><tbody>{lines.map(l=><tr key={l.id}>{cols.map(c=><td key={c.key} className={c.left?"receipt-left":undefined}>{c.cell(l)}</td>)}</tr>)}</tbody></table>;}
export default function InvoicePaper({model,invoice:i,words}:{model:any;invoice:any;words:(n:number)=>string}) {
 const t=invoiceTotals(i),format=modelFormat(model),measure=useRef<HTMLDivElement>(null),[heights,setHeights]=useState<number[]>([]),[headHeight,setHeadHeight]=useState(0);
 const firstHead=<><div className="receipt-title"><h1>FACTURE</h1><span>{t.taxMode==="ttc"?"TTC":"Hors taxe"}</span></div><div className="receipt-info"><div><small>FACTURÉ À</small><strong>{i.client.name}</strong>{clientDetailLines(i.client).map((text:string,n:number)=><p key={n}>{text}</p>)}</div><div className="receipt-reference"><div><small>N° FACTURE</small><strong>{i.number}</strong></div><div><small>DATE</small><strong>{new Date(i.date+"T12:00:00").toLocaleDateString("fr-FR")}</strong></div><p>Référence : {i.reference?.trim() || i.number}</p>{i.purchaseOrder?.trim()&&<p><strong>B C N° :</strong> {i.purchaseOrder}</p>}</div></div></>;
 useLayoutEffect(()=>{const rows=measure.current?.querySelectorAll("tbody tr");if(rows){const next=Array.from(rows).map(r=>(r as HTMLElement).offsetHeight);setHeights(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);}
  // How far down the first page the table's header ends: a client with many details pushes the lines down.
  const table=measure.current?.querySelector("table"),thead=table?.querySelector("thead");if(table&&thead)setHeadHeight(table.offsetTop+thead.offsetTop+thead.offsetHeight);},[i.lines,i.client,i.purchaseOrder]);
 // Line space on a page, in px: the first page carries the client and reference blocks, the next ones only a short title.
 // Totals, amount in words, payment mode and signature take `closing` px and go on the last page only.
 // The first page never lets a line reach the footer (it starts 1000 px down; the content starts at 172 px).
 const FIRST=580,first=headHeight?Math.min(FIRST,Math.floor(1000-172-headHeight-6)):FIRST,next=740,closing=FIRST-(t.discount>0&&i.advance>0?235:t.taxMode==="ttc"||t.discount>0?270:320);
 const height=(line:any,index:number)=>heights[index]??Math.max(45,20+Math.max(line.designation.split("\n").length,(line.destination||"").split("\n").length,(line.contract||"").split("\n").length)*17);
 const groups:any[][]=[[]],used=[0];
 i.lines.forEach((line:any,index:number)=>{const h=height(line,index),room=groups.length===1?first:next;if(used.at(-1)!+h>room&&groups.at(-1)!.length){groups.push([]);used.push(0);}groups.at(-1)!.push(line);used[used.length-1]+=h;});
 // The closing block must fit under the last lines: otherwise the last line moves to a new page with it, so no page holds totals alone.
 if(used.at(-1)!+closing>(groups.length===1?first:next)&&i.lines.length){const last=groups.at(-1)!;groups.push(last.length>1?[last.pop()]:[]);}
 return <div className="document-pages receipt-pages"><div className="document-measurement receipt-measurement" ref={measure}>{firstHead}<Lines lines={i.lines} invoice={i}/></div>{groups.map((rows,index)=><article className="document-page receipt-page" key={index} aria-label={"Facture "+i.number+", page "+(index+1)} style={{width:794,height:1123}}><DocumentBackground format={format}/><div className="receipt-content">{format.banner&&<img className="receipt-banner" src={format.banner} alt="Bannière"/>}{!format.stationery&&!format.banner&&<div className="receipt-company"><strong>{i.company.name}</strong><p>{i.company.subtitle}</p></div>}{index>0?<div className="receipt-title receipt-title-next"><h1>FACTURE</h1><span>N° {i.number} · {i.client.name} · suite</span></div>:firstHead}{rows.length>0&&<Lines lines={rows} invoice={i}/>}{index===groups.length-1&&<><div className="receipt-totals receipt-totals-aligned" style={totalsAlign(i)}>{t.discount>0&&<><p><span>Montant de départ</span><strong>{money(t.subtotal)}</strong></p><p><span>Remise</span><strong>− {money(t.discount)}</strong></p></>}<p><span>{t.discount>0?"Montant HT après remise":"Montant HT"}</span><strong>{money(t.ht)}</strong></p>{t.taxMode==="ttc"&&<><p><span>TVA</span><strong>{money(t.tax)}</strong></p><p className="receipt-total"><span>Total TTC</span><strong>{money(t.ttc)}</strong></p></>}{i.advance>0&&<><p><span>Avance reçue</span><strong>− {money(i.advance)}</strong></p><p className="receipt-total"><span>Reste à payer</span><strong>{money(t.due)}</strong></p></>}</div><p className="receipt-words">Arrêtée la présente facture à la somme de <strong>{words(t.ttc).toUpperCase()} FRANCS CFA.</strong></p><div className="receipt-payment">{optionalText(i.note)&&<p className="receipt-note">{i.note}</p>}<p><u>Mode de règlement :</u> {normalizePayment(i.payment)}</p><div className="receipt-signature" style={{width:totalsAlign(i).width}}>La Direction.</div></div></>}</div><DocumentFooter format={format}/>{groups.length>1&&<span className="receipt-page-number">Page {index+1} / {groups.length}</span>}</article>)}</div>;
}
