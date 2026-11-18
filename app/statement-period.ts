export type StatementPeriod={from:string;to:string};
export function dateValid(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T12:00:00");return Number.isFinite(d.getTime())&&d.getFullYear()===Number(value.slice(0,4))&&d.getMonth()+1===Number(value.slice(5,7))&&d.getDate()===Number(value.slice(8,10));}
export const periodDate=(date:string)=>new Date(date+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}).replace(/^1 /,"1er ");
export const periodTitle=(p:StatementPeriod)=>"État du "+periodDate(p.from)+" au "+periodDate(p.to);
import { invoiceTotals } from "./invoice-math";
import { balance } from "./client-account";
export function periodData(invoices:any[],payments:any[],credits:any[],period:StatementPeriod){
 const bills=invoices.filter(i=>i.date<=period.to),ids=new Set(bills.map(i=>i.id)),paid=payments.filter(p=>ids.has(p.invoiceId)&&!p.cancelledAt&&p.date<=period.to),notes=credits.filter(c=>ids.has(c.invoiceId)&&c.date<=period.to);
 return {bills,paid,notes};
}
export function periodTotals(invoices:any[],payments:any[],credits:any[],p:StatementPeriod){
 const {bills,paid,notes}=periodData(invoices,payments,credits,p),within=(d:string)=>d>=p.from&&d<=p.to;
 const closing=bills.reduce((a,i)=>{const b=balance(i,paid,notes);return{due:a.due+b.due,refund:a.refund+b.refund};},{due:0,refund:0});
 const total=bills.filter(i=>within(i.date)).reduce((n,i)=>n+invoiceTotals(i).ttc,0),ht=bills.filter(i=>within(i.date)).reduce((n,i)=>n+invoiceTotals(i).ht,0),advance=bills.filter(i=>within(i.date)).reduce((n,i)=>n+i.advance,0),received=advance+paid.filter(i=>within(i.date)).reduce((n,i)=>n+i.amount,0),credited=notes.filter(i=>within(i.date)).reduce((n,i)=>n+i.amount,0);
 const opening=bills.filter(i=>i.date<p.from).reduce((n,i)=>n+invoiceTotals(i).ttc-i.advance,0)-paid.filter(i=>i.date<p.from).reduce((n,i)=>n+i.amount,0)-notes.filter(i=>i.date<p.from).reduce((n,i)=>n+i.amount,0);
 return {total,ht,tax:total-ht,advance,received,credited,...closing,opening,closing:opening+total-credited-received};
}

/** Which invoices a statement covers: all of them, only those fully paid, or those with something still owed (partly paid included).
 *  Judged at the end of the period, with the payments and credit notes known by then. */
export type StatementFilter="toutes"|"payees"|"impayees";
export const FILTER_LABEL:Record<StatementFilter,string>={toutes:"Toutes les factures",payees:"Factures payées",impayees:"Factures non payées"};
export function filterInvoices(invoices:any[],payments:any[],credits:any[],period:StatementPeriod,filter:StatementFilter="toutes"){
 if(filter==="toutes")return invoices;
 const {paid,notes}=periodData(invoices,payments,credits,period);
 return invoices.filter(i=>i.date<=period.to&&(balance(i,paid,notes).due>0)===(filter==="impayees"));
}
export const statementTitle=(p:StatementPeriod,filter:StatementFilter="toutes")=>periodTitle(p)+(filter==="toutes"?"":" · "+FILTER_LABEL[filter]);
