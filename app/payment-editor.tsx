import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { paymentMethods } from "./invoice-math";
import { balance } from "./client-account";
import { formatMoney as money } from "./document-model";
export default function PaymentEditor({invoice,invoices,payments,credits,editing,limit,amount,date,method,reference,error,onInvoice,onAmount,onDate,onMethod,onReference,onSave,onClose}:{invoice:any;invoices:any[];payments:any[];credits:any[];editing:boolean;limit:number;amount:string;date:string;method:string;reference:string;error:string;onInvoice:(id:string)=>void;onAmount:(v:string)=>void;onDate:(v:string)=>void;onMethod:(v:string)=>void;onReference:(v:string)=>void;onSave:()=>void;onClose:()=>void}){
 const available=invoice?invoices.filter(i=>i.client.id===invoice.client.id&&balance(i,payments,credits).due>0):[];
 return <Dialog open={!!invoice} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="payment-dialog"><DialogHeader><DialogTitle>{editing?"Modifier le paiement":"Enregistrer un paiement"}</DialogTitle><DialogDescription>{invoice?.client.name} · facture {invoice?.number}</DialogDescription></DialogHeader>{invoice&&<form onSubmit={e=>{e.preventDefault();onSave();}}>
 {!editing&&available.length>1&&<label className="field payment-invoice-choice"><span>Pour quelle facture ?</span><select value={invoice.id} onChange={e=>onInvoice(e.target.value)}>{available.map(i=><option key={i.id} value={i.id}>{i.number} · reste {money(balance(i,payments,credits).due)}</option>)}</select></label>}
 <div className="payment-due-box"><span>{editing?"Montant maximum pour ce paiement":"Il reste à payer"}</span><strong>{money(limit)}</strong></div>
 {editing&&<p className="field-note">Le nouveau montant remplacera l’ancien. La correction sera conservée dans l’historique.</p>}
 <label className="field payment-amount-field"><span>{editing?"Montant corrigé (FCFA)":"Combien avez-vous reçu ? (FCFA)"}</span><input autoFocus required type="number" min="1" step="1" max={limit} value={amount} onChange={e=>onAmount(e.target.value)} placeholder="Ex. 50 000"/></label>
 <button type="button" className="fill-balance" onClick={()=>onAmount(String(limit))}>{editing?"Régler entièrement cette facture":"Le client a payé tout le reste"}</button>
 <div className="grid-fields payment-details"><label className="field"><span>Date du paiement</span><input required type="date" value={date} onChange={e=>onDate(e.target.value)}/></label><label className="field"><span>Comment a-t-il payé ?</span><select value={method} onChange={e=>onMethod(e.target.value)}>{!paymentMethods.includes(method)&&<option value={method}>{method} · ancien mode</option>}{paymentMethods.map(m=><option key={m}>{m}</option>)}</select></label></div>
 <details className="payment-note" open={reference?true:undefined}><summary>Référence ou note (facultatif)</summary><label className="field"><span>Référence ou note</span><input value={reference} onChange={e=>onReference(e.target.value)} placeholder="Ex. référence du virement"/></label></details>
 {amount&&Number(amount)>0&&<div className="payment-after">Après {editing?"correction":"ce paiement"}, il restera <strong>{money(Math.max(0,limit-Number(amount)))}</strong></div>}
 {error&&<p className="payment-error" role="alert">{error}</p>}
 <div className="dialog-actions"><button type="button" className="outline" onClick={onClose}>Annuler</button><button type="submit" className="primary">{editing?"Enregistrer la correction":"Enregistrer le paiement"}</button></div>
 </form>}</DialogContent></Dialog>;
}
