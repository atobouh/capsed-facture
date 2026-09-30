import { useState } from "react";
import { ArrowRight, Bell, Check, Clock3, RefreshCw, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { balance } from "./client-account";
import { formatMoney as money } from "./document-model";

export type ControlRequest = {
  id: string; clientId: string; clientName: string; invoiceId: string; invoiceNumber: string;
  amount: number; paymentDate: string; method: string; reference: string; message: string;
  createdAt: string; receivedAt?: string; readAt?: string; resolvedAt?: string; response?: string;
};
export type ControlSnapshot = { clients: any[]; invoices: any[]; payments: any[]; credits: any[]; deliveries: {invoiceId:string;declaredAt:string}[]; receivedAt: string };
const when = (date: string) => new Date(date).toLocaleString("fr-FR", { day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit" });
export function RequestStatus({ request: r }: { request: ControlRequest }) {
  return <span className={`request-status ${r.resolvedAt ? "done" : r.readAt ? "read" : "waiting"}`}>{r.resolvedAt ? <Check size={12}/> : <Clock3 size={12}/>} {r.resolvedAt ? "Traitée" : r.readAt ? "Lue" : r.receivedAt ? "Reçue sur le poste" : "En attente de connexion"}</span>;
}
export function SimulationNotice() { return <details className="control-simulation"><summary>Simulation · aucun envoi réel</summary><p>Les demandes d’essai restent dans cette session et s’effacent au rechargement.</p></details>; }

export function TeamNotifications({requests,connected,onSync,onConnection,onRead,onResolve,onInvoice,onPayment,payments,invoices,credits}: {
  requests:ControlRequest[];connected:boolean;onSync:()=>void;onConnection:()=>void;onRead:(id:string)=>void;onResolve:(id:string,response:string)=>void;
  onInvoice:(id:string)=>void;onPayment:(id:string)=>void;payments:any[];invoices:any[];credits:any[];
}) {
  const [selected,setSelected]=useState(""),[response,setResponse]=useState(""),[filter,setFilter]=useState<"open"|"done">("open");
  const received=requests.filter(r=>r.receivedAt),pending=requests.filter(r=>!r.receivedAt);
  const visible=received.filter(r=>filter==="done" ? !!r.resolvedAt : !r.resolvedAt);
  const active=received.find(r=>r.id===selected);
  function open(r:ControlRequest){setSelected(r.id);setResponse(r.response??"");onRead(r.id);}
  return <><div className="heading"><div><h1>Notifications</h1></div><button className="outline" onClick={connected ? onSync : onConnection}><RefreshCw size={15}/> {connected ? "Simuler une synchronisation" : "Simuler la reconnexion"}</button></div><SimulationNotice/>{!connected && <div className="notification-waiting"><WifiOff size={16}/><span>Poste hors ligne dans la simulation. Les nouvelles demandes attendent la reconnexion.</span></div>}{pending.length>0 && <div className="notification-waiting"><WifiOff size={16}/><span>{pending.length} demande(s) en attente de réception dans la simulation.</span></div>}
    <div className="register-tabs" role="tablist" aria-label="Notifications"><button role="tab" aria-selected={filter==="open"} onClick={()=>setFilter("open")}>À traiter <span>{received.filter(r=>!r.resolvedAt).length}</span></button><button role="tab" aria-selected={filter==="done"} onClick={()=>setFilter("done")}>Traitées <span>{received.filter(r=>r.resolvedAt).length}</span></button></div>
    <section className="card notification-list">{visible.map(r=><button className={`notification-row ${!r.readAt ? "unread":""}`} key={r.id} onClick={()=>open(r)}><span className="notification-symbol"><Bell size={18}/></span><span><strong>{r.clientName}</strong><p>Paiement à vérifier · {money(r.amount)} · {r.invoiceNumber}</p><small>{when(r.receivedAt!)}{r.readAt ? "":" · Non lue"}</small></span><RequestStatus request={r}/><ArrowRight size={16}/></button>)}{!visible.length && <div className="empty"><Bell size={26}/><strong>{filter==="done" ? "Aucune demande traitée":"Aucune notification reçue"}</strong><span>{pending.length ? connected ? "Synchronisez pour recevoir les demandes d’essai." : "Simulez la reconnexion, puis synchronisez." : "Les demandes du responsable apparaîtront ici après synchronisation."}</span></div>}</section>
    <Dialog open={!!active} onOpenChange={open=>{if(!open)setSelected("");}}><DialogContent className="notification-dialog"><DialogHeader><DialogTitle>Paiement à vérifier</DialogTitle><DialogDescription>{active?.clientName} · {active?.invoiceNumber}</DialogDescription></DialogHeader>{active && <><div className="notification-request-amount"><strong>{money(active.amount)}</strong><span>{active.paymentDate} · {active.method}</span>{active.reference && <span>Référence : {active.reference}</span>}</div>{active.message && <p className="notification-message">{active.message}</p>}<div className="notification-context-actions"><button className="outline" disabled={!invoices.some(i=>i.id===active.invoiceId)} onClick={()=>{setSelected("");onInvoice(active.invoiceId);}}>Voir la facture</button><button className="primary" disabled={!invoices.some(i=>i.id===active.invoiceId && balance(i,payments,credits).due>0)} onClick={()=>{setSelected("");onPayment(active.invoiceId);}}>Vérifier / enregistrer le paiement</button></div>{payments.some(p=>p.invoiceId===active.invoiceId && !p.cancelledAt && p.amount===active.amount) && <p className="notification-match">Un paiement du même montant existe déjà. Vérifiez sa date et sa référence avant toute nouvelle saisie.</p>}<RequestStatus request={active}/>{active.resolvedAt ? <p className="notification-message">{active.response}</p> : <form onSubmit={e=>{e.preventDefault();if(response.trim()){onResolve(active.id,response.trim());setSelected("");}}}><label className="field"><span>Résultat de la vérification</span><input required value={response} onChange={e=>setResponse(e.target.value)} placeholder="Ex. Déjà enregistré, référence OM123."/></label><p className="credit-form-note">Traiter la demande ne crée pas de paiement. Le solde change uniquement lors d’une écriture de paiement.</p><div className="dialog-actions"><button type="submit" className="primary" disabled={!response.trim()}><Check size={15}/> Marquer comme traitée</button></div></form>}</>}</DialogContent></Dialog>
  </>;
}
