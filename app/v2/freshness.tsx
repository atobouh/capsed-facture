import { useState } from "react";
import { WifiOff } from "lucide-react";
import { Button, Modal, Notice } from "./ui";
import { ago, hoursSince, timeFr } from "./store";
import { dismissRejected, syncNow, useSync } from "./sync";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const hour = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
const when = (iso?: string) => !iso ? "" : new Date(iso).toDateString() === new Date().toDateString() ? hour(iso) : timeFr(iso);

/** Office app: is everything sent? Shown in the side menu and in the status bar. */
export function SyncLine({ bar }: { bar?: boolean }) {
  const s = useSync(), [open, setOpen] = useState(false);
  const [tone, text, sub] = s.authLost ? ["bad", "Ce poste n’est plus relié", "Demandez un nouveau code à la Direction."]
    : !s.online ? ["warn", s.pending ? `${plural(s.pending, "modification", "modifications")} en attente d’envoi` : "Pas de connexion", `Hors ligne depuis ${when(s.offlineSince)}. Vous pouvez continuer à travailler normalement.`]
    : s.pending ? ["info", `Envoi de ${plural(s.pending, "modification", "modifications")}…`, ""]
    : ["good", s.lastOkAt ? `Tout est envoyé · ${when(s.lastOkAt)}` : "Synchronisation…", ""];
  return <>
    <p className={`cx-sync cx-sync-${tone}${bar ? " cx-sync-bar" : ""}`} role="status" title={sub || undefined}>
      {tone === "warn" || tone === "bad" ? <WifiOff size={14} aria-hidden="true" /> : <span className="cx-sync-dot" aria-hidden="true" />}
      <span>{text}{bar && sub ? <small> {sub}</small> : null}</span>
      {bar && (tone === "warn" || tone === "bad") && !s.authLost && <button type="button" className="cx-link-btn" onClick={syncNow}>Réessayer</button>}
    </p>
    {!bar && s.rejected.length > 0 && <button type="button" className="cx-sync-rejected" onClick={() => setOpen(true)}>{plural(s.rejected.length, "modification refusée", "modifications refusées")}</button>}
    {open && <Modal title="Modifications refusées par le serveur" subtitle="Le serveur a gardé sa version ; rien n’a été perdu ailleurs." onClose={() => setOpen(false)} actions={<Button kind="primary" onClick={() => { dismissRejected(); setOpen(false); }}>J’ai compris</Button>}>
      <ul className="cx-mini-list">{s.rejected.map((r, i) => <li key={i}>{timeFr(r.at)} · {r.text}</li>)}</ul>
    </Modal>}
  </>;
}

/** Direction site: how fresh is what you are looking at, and which office computer is late. */
export function FreshnessBar({ home }: { home: boolean }) {
  const s = useSync(), devices = s.devices.filter(d => !d.revoked_at);
  const stale = devices.filter(d => !d.last_push || hoursSince(d.last_push) > 24);
  return <div className="cx-freshness cx-noprint">
    {!s.online ? <p className="cx-fresh cx-fresh-stale" role="status"><WifiOff size={14} aria-hidden="true" /><span>Vous êtes hors ligne · données du {timeFr(s.lastPullAt ?? new Date().toISOString())}<small>{s.pending ? `${plural(s.pending, "action partira", "actions partiront")} à la reconnexion.` : "Ce que vous voyez date de ce moment."}</small></span></p>
      : !home && <p className="cx-fresh" role="status"><span className="cx-sync-dot" aria-hidden="true" /><span>Situation au {timeFr(s.lastPullAt ?? new Date().toISOString())}{s.pending ? ` · envoi de ${plural(s.pending, "action", "actions")}…` : ""}<small>{devices.length ? devices.map(d => `${d.name} : ${d.last_push ? `envoyé ${ago(d.last_push)}` : "rien envoyé"}`).join(" · ") : "Aucun poste du bureau n’est encore relié."}</small></span></p>}
    {stale.map(d => <Notice key={d.id} tone="warn">{d.last_push ? `Le poste « ${d.name} » n’a rien envoyé depuis le ${timeFr(d.last_push)}. Ce qu’il a saisi depuis n’apparaît pas encore.` : `Le poste « ${d.name} » n’a encore rien envoyé.`}</Notice>)}
    {s.rejected.length > 0 && <Notice tone="bad" title="Action refusée par le serveur">{s.rejected[0].text} <button type="button" className="cx-link-btn" onClick={dismissRejected}>Masquer</button></Notice>}
  </div>;
}
