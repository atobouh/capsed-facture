import { OFFICIAL_FOOTER } from "./invoice-brand";
import { invoiceTotals, lineAmount, normalizePayment, printedQuantity } from "./invoice-math";
import { clientDetailLines } from "./client-details";
type Cell = string | number;
const xml=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
export function downloadBlob(data:Blob,name:string){const url=URL.createObjectURL(data),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function zip(files:Record<string,string>){
 const encoder=new TextEncoder(),chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 const crc=(data:Uint8Array)=>{let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 for(const [name,value] of Object.entries(files)){const path=encoder.encode(name),data=encoder.encode(value),sum=crc(data);const header=new Uint8Array(30+path.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);header.set(path,30);chunks.push(header,data);
 const entry=new Uint8Array(46+path.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x0800,true);e.setUint32(16,sum,true);e.setUint32(20,data.length,true);e.setUint32(24,data.length,true);e.setUint16(28,path.length,true);e.setUint32(42,offset,true);entry.set(path,46);central.push(entry);offset+=header.length+data.length;}
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,central.reduce((n,c)=>n+c.length,0),true);e.setUint32(16,offset,true);
 return new Blob([...chunks,...central,end] as BlobPart[],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
export function downloadExcel(rows:Cell[][],filename:string){
 const invoice=filename.startsWith("facture-"),widths=invoice?[48,27,13,19,20]:rows[1]?.length===7?[34,19,19,19,19,21,19]:[17,37,42,21,24,21],count=widths.length;
 const col=(n:number):string=>n<26?String.fromCharCode(65+n):col(Math.floor(n/26)-1)+String.fromCharCode(65+n%26);
 const last=col(count-1),header=invoice?rows.findIndex(r=>r[0]==="Désignation"):1,tableEndIndex=rows.findIndex((r,i)=>i>header&&!r.length),tableEnd=tableEndIndex<0?rows.length:tableEndIndex;
 const merges:string[]=[],cell=(value:Cell,r:number,c:number,style:number)=>{const ref=col(c)+(r+1);if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&((!invoice&&c===0)||(invoice&&rows[r][0]==="Date"&&c===1))){value=(Date.parse(value+"T00:00:00Z")-Date.UTC(1899,11,30))/86400000;style=invoice?20:r%2?22:21;}return typeof value==="number"&&Number.isFinite(value)?'<c r="'+ref+'" s="'+style+'"><v>'+value+'</v></c>':'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';};
 const merge=(r:number,from:number,to:number)=>{if(to>from)merges.push(col(from)+(r+1)+":"+col(to)+(r+1));};
 const data=rows.map((row,r)=>{
  let cells="",height=22;
  const label=String(row[0]??"");
  if(!row.length)height=11;
  else if(r===0){merge(r,0,count-1);cells=cell(row[0],r,0,2);height=30;}
  else if(r===header){cells=row.map((v,c)=>cell(v,r,c,4)).join("");height=32;}
  else if(r>header&&r<tableEnd){cells=row.map((v,c)=>cell(v,r,c,typeof v==="number"?(invoice&&c===2&&!Number.isInteger(v)?19:r%2?8:6):(r%2?7:5))).join("");height=Math.max(27,...row.map((v,c)=>Math.max(...String(v).split("\n").map(line=>Math.ceil(line.length/(widths[c]||20))))*15+12));}
  else if(invoice&&r<header){
   if(row.length===1){merge(r,0,count-1);cells=cell(row[0],r,0,18);height=Math.max(22,String(row[0]).split("\n").length*15+8);}
   else if(label==="FACTURE"){merge(r,0,2);merge(r,3,4);cells=cell(row[0],r,0,3)+cell(row[1],r,3,3);height=29;}
   else{merge(r,1,count-1);cells=cell(row[0],r,0,17)+cell(row[1],r,1,18);height=23;}
  }else if(invoice&&row.length===2&&typeof row[1]==="number"){
   const total=["Total TTC","Reste à payer"].includes(label);merge(r,0,3);cells=cell(row[0],r,0,total?11:9)+cell(row[1],r,4,total?12:10);height=total?29:24;
  }else if(label==="La Direction."){merge(r,count-2,count-1);cells=cell(label,r,count-2,16);height=42;}
  else if(label.startsWith("Merci pour")){merge(r,0,count-1);cells=cell(label,r,0,14);height=27;}
  else if(label.startsWith("Suarl au capital")||label.startsWith("RCCM N°")){merge(r,0,count-1);cells=cell(label,r,0,13);height=30;}
  else if(label.startsWith("Arrêtée la présente")){merge(r,0,count-1);cells=cell(label,r,0,15);height=Math.max(35,Math.ceil(label.length/120)*15+10);}
  else if(row.length===2){merge(r,1,count-1);cells=cell(row[0],r,0,17)+cell(row[1],r,1,18);height=25;}
  else if(row.length===1){merge(r,0,count-1);cells=cell(row[0],r,0,18);height=Math.max(24,String(row[0]).split("\n").length*15+10);}
  else cells=row.map((v,c)=>cell(v,r,c,typeof v==="number"?1:0)).join("");
  return '<row r="'+(r+1)+'" ht="'+height+'" customHeight="1">'+cells+'</row>';
 }).join("");
 const ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main",blue="FF244A87",light="FFF0F4FA";
 const font=(size:number,color:string,bold=false,extra="")=>'<font><sz val="'+size+'"/><color rgb="'+color+'"/><name val="Arial"/>'+(bold?"<b/>":"")+extra+'</font>';
 const fonts=[font(11,"FF202A37"),font(16,blue,true),font(12,blue,true),font(11,"FFFFFFFF",true),font(11,"FF202A37",true),font(8,blue),font(11,blue,false,"<i/>"),font(11,"FF202A37",true),font(14,blue,true,"<u/>"),font(10,"FF5D6B7D")];
 const xf=(fontId=0,fillId=0,borderId=0,numFmtId=0,align="left",wrap=true)=>'<xf numFmtId="'+numFmtId+'" fontId="'+fontId+'" fillId="'+fillId+'" borderId="'+borderId+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="'+align+'" vertical="center" wrapText="'+(wrap?1:0)+'"/></xf>';
 const styles=[xf(),xf(0,0,0,3,"center"),xf(1),xf(2),xf(3,2,1,0,"center"),xf(0,0,2),xf(0,0,2,3,"center"),xf(0,3,2),xf(0,3,2,3,"center"),xf(0,0,2),xf(4,0,2,3,"center"),xf(4,3,3),xf(4,3,3,3,"center"),xf(5,0,0,0,"center"),xf(6,0,0,0,"center"),xf(7,0,0,0,"center"),xf(8,0,0,0,"center"),xf(9),xf(),xf(0,0,2,0,"center"),xf(0,0,0,164),xf(0,0,2,164,"center"),xf(0,3,2,164,"center")];
 const styleSheet='<styleSheet xmlns="'+ns+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="'+fonts.length+'">'+fonts.join("")+'</fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="'+blue+'"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="'+light+'"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="4"><border/><border><left style="thin"><color rgb="FFFFFFFF"/></left><right style="thin"><color rgb="FFFFFFFF"/></right></border><border><bottom style="hair"><color rgb="FFD8E1EF"/></bottom></border><border><top style="thin"><color rgb="'+blue+'"/></top><bottom style="thin"><color rgb="'+blue+'"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="'+styles.length+'">'+styles.join("")+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
 const files={
 "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 "_rels/.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 "xl/workbook.xml":'<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Document" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Document!$A$1:$'+last+'$'+rows.length+'</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">Document!$'+(header+1)+':$'+(header+1)+'</definedName></definedNames></workbook>',
 "xl/_rels/workbook.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 "xl/styles.xml":styleSheet,
 "xl/worksheets/sheet1.xml":'<worksheet xmlns="'+ns+'"><sheetPr><tabColor rgb="'+blue+'"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:'+last+rows.length+'"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="'+(header+1)+'" topLeftCell="A'+(header+2)+'" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>'+widths.map((w,c)=>'<col min="'+(c+1)+'" max="'+(c+1)+'" width="'+w+'" customWidth="1"/>').join("")+'</cols><sheetData>'+data+'</sheetData>'+(merges.length?'<mergeCells count="'+merges.length+'">'+merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join("")+'</mergeCells>':"")+'<printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.4" bottom="0.4" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="'+(invoice?"portrait":"landscape")+'" fitToWidth="1" fitToHeight="0"/></worksheet>'
 };downloadBlob(zip(files),filename.endsWith(".xlsx")?filename:filename+".xlsx");
}

export function exportInvoice(i:any,words:(n:number)=>string){
 const t=invoiceTotals(i),rows:Cell[][]=[[i.company.name],...(i.company.subtitle?.trim()?[[i.company.subtitle]]:[]),["FACTURE",i.number],["Date",i.date],...(i.purchaseOrder?.trim()?[["BC",i.purchaseOrder]]:[]),["Client",i.client.name],...clientDetailLines(i.client).map(s=>[s]),[],["Désignation","Destination","Quantité","Prix unitaire HT","Montant HT"],...i.lines.map((l:any)=>[l.designation,l.destination,l.quantity,Math.round(l.unitPrice),lineAmount(l)]),[],["Montant de départ",t.subtotal],...(t.discount?[["Remise",-t.discount]]:[]),["Montant HT",t.ht],...(t.taxMode==="ttc"?[["TVA",t.tax],["Total TTC",t.ttc]]:[]),...(i.advance?[["Avance",-i.advance],["Reste à payer",t.due]]:[]),[],["Arrêtée la présente facture à la somme de "+words(t.ttc).toUpperCase()+" FRANCS CFA."],["Mode de règlement",normalizePayment(i.payment)],...(i.note?.trim()?[[i.note]]:[]),["La Direction."],["Merci pour votre confiance."],...OFFICIAL_FOOTER.map(line=>[line])];
 downloadExcel(rows,"facture-"+i.number+".xlsx");
}
