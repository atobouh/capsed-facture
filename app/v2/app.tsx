import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Banknote, CircleHelp, ClipboardCheck, FileText, Inbox, LayoutGrid, Monitor, Settings, Smartphone, Truck, Users, Wallet, Check } from "lucide-react";
import { ToastHost, Modal, Button } from "./ui";
import { FacturationScreen } from "./facturation";
import type { FRoute } from "./facturation";
import { EncaissementScreen } from "./encaissement";
import type { ERoute } from "./encaissement";
import { ResponsableScreen, pendingCount } from "./responsable";
import type { RRoute } from "./responsable";
import { ROLE_LABEL, ago, hoursSince, liveInvoices, timeFr, useData } from "./store";
import type { Role } from "./store";

type AnyRoute = { name: string; id?: string; [k: string]: string | undefined };
const HOME: Record<Role, AnyRoute> = { facturation: { name: "factures" }, encaissement: { name: "encaisser" }, responsable: { name: "clients" } };
const readRole = (): Role | null => { const h = location.hash.slice(1); return h === "facturation" || h === "encaissement" || h === "responsable" ? h : null; };

export default function App() {
  const [role, setRole] = useState<Role | null>(readRole), [route, setRoute] = useState<AnyRoute>(() => HOME[readRole() ?? "facturation"]), [help, setHelp] = useState(false);
  useEffect(() => { const h = () => { const r = readRole(); setRole(r); if (r) setRoute(HOME[r]); }; window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const nav = useCallback((r: AnyRoute) => { setRoute(r); window.scrollTo(0, 0); document.querySelector(".cx-main")?.scrollTo(0, 0); }, []);
  useEffect(() => { document.title = role ? `CAPSED · ${ROLE_LABEL[role]}` : "CAPSED Facture"; }, [role]);
  if (!role) return <div className="cx-app"><RolePicker /><ToastHost /></div>;
  const screen = role === "facturation" ? <FacturationScreen route={route as FRoute} nav={nav as (r: FRoute) => void} />
    : role === "encaissement" ? <EncaissementScreen route={route as ERoute} nav={nav as (r: ERoute) => void} />
    : <ResponsableScreen route={route as RRoute} nav={nav as (r: RRoute) => void} />;
  return <div className={`cx-app cx-role-${role}`}>
    {role === "responsable" ? <SiteShell route={route} nav={nav} onHelp={() => setHelp(true)}>{screen}</SiteShell> : <OfficeShell role={role} route={route} nav={nav} onHelp={() => setHelp(true)}>{screen}</OfficeShell>}
    {help && <HelpPanel role={role} route={route.name} onClose={() => setHelp(false)} />}
    <ToastHost />
  </div>;
}

function RolePicker() {
  const card = (role: Role, icon: ReactNode, person: string, where: ReactNode, does: string[]) => <a className={`cx-role-card cx-role-${role}`} href={`#${role}`}>
    <span className="cx-role-icon">{icon}</span><strong>{ROLE_LABEL[role]}</strong><span className="cx-role-person">{person}</span>
    <ul>{does.map(t => <li key={t}><Check size={16} />{t}</li>)}</ul><span className="cx-role-where">{where}</span><span className="cx-role-go">Entrer</span></a>;
  return <main className="cx-picker">
    <div className="cx-picker-brand"><span className="cx-logo">C</span><div><strong>CAPSED</strong><small>Facturation et suivi des clients</small></div></div>
    <h1>Qui êtes-vous ?</h1>
    <p className="cx-lead">Chaque espace montre seulement ce dont vous avez besoin.</p>
    <div className="cx-role-cards">
      {card("facturation", <FileText size={28} />, "Awa, au bureau", <><Monitor size={16} /> Application de bureau</>, ["Créer et imprimer les factures", "Déclarer la remise au client", "Tenir la liste des clients"])}
      {card("encaissement", <Wallet size={28} />, "Paul, au bureau", <><Monitor size={16} /> Application de bureau</>, ["Enregistrer chèques, virements, OM, MoMo et espèces", "Voir ce qui reste à encaisser", "Répondre aux vérifications"])}
      {card("responsable", <LayoutGrid size={28} />, "La Direction", <><Smartphone size={16} /> Site de contrôle, téléphone ou ordinateur</>, ["Savoir où en est chaque client, sans appeler", "Valider les paiements", "Décider des corrections"])}
    </div>
    <p className="cx-demo-note">Démonstration · données fictives enregistrées dans ce navigateur · rien n’est envoyé. Aucune action ne supprime quoi que ce soit.</p>
  </main>;
}

function OfficeShell({ role, route, nav, onHelp, children }: { role: Role; route: AnyRoute; nav: (r: AnyRoute) => void; onHelp: () => void; children: ReactNode }) {
  const d = useData();
  const items: { key: string; label: string; icon: ReactNode; count?: number; tone?: string }[] = role === "facturation" ? [
    { key: "factures", label: "Factures", icon: <FileText size={20} /> },
    { key: "remises", label: "Remises", icon: <Truck size={20} />, count: liveInvoices(d).filter(i => i.status === "emise" && !i.delivery).length },
    { key: "clients", label: "Clients", icon: <Users size={20} /> },
    { key: "demandes", label: "Demandes", icon: <Inbox size={20} />, count: d.requests.filter(r => r.by === "u-awa" && r.status !== "envoyee" && r.decidedAt && hoursSince(r.decidedAt) < 72).length, tone: "info" },
  ] : [
    { key: "encaisser", label: "À encaisser", icon: <Wallet size={20} /> },
    { key: "paiements", label: "Paiements", icon: <Banknote size={20} /> },
    { key: "demandes", label: "Demandes", icon: <Inbox size={20} />, count: d.requests.filter(r => r.kind === "verification" && r.status === "envoyee").length, tone: "warn" },
  ];
  const section = route.name === "nouvelle" || route.name === "facture" ? "factures" : route.name === "client" ? "clients" : route.name === "paiement" ? "encaisser" : route.name === "detail" ? "paiements" : route.name;
  const who = role === "facturation" ? "Awa" : "Paul";
  return <div className="cx-office">
    <aside className="cx-sidebar cx-noprint">
      <div className="cx-brand"><span className="cx-logo">C</span><div><strong>CAPSED</strong><small>Facture</small></div></div>
      <div className="cx-space-badge">Espace {ROLE_LABEL[role]}</div>
      <nav>{items.map(i => <button type="button" key={i.key} className={section === i.key ? "cx-on" : ""} onClick={() => nav({ name: i.key })}>{i.icon}<span>{i.label}</span>{!!i.count && <b className={`cx-count cx-tone-${i.tone ?? "warn"}`}>{i.count}</b>}</button>)}</nav>
      <div className="cx-sidebar-foot">
        <button type="button" onClick={onHelp}><CircleHelp size={20} /><span>Aide</span></button>
        <div className="cx-user"><span>{who[0]}</span><div><strong>{who}</strong><a href="#">Changer d’espace</a></div></div>
      </div>
    </aside>
    <div className="cx-main">
      <div className="cx-topbar cx-noprint"><span className="cx-demo-pill">Démonstration · données fictives</span><span className="cx-sync"><span className="cx-sync-dot" />À jour · enregistré sur ce poste à {timeFr(d.officeSyncAt).slice(-5)}</span><span className="cx-kbd">Ctrl+N : {role === "facturation" ? "nouvelle facture" : "nouveau paiement"}</span></div>
      <main className="cx-content">{children}</main>
    </div>
  </div>;
}

function SiteShell({ route, nav, onHelp, children }: { route: AnyRoute; nav: (r: AnyRoute) => void; onHelp: () => void; children: ReactNode }) {
  const d = useData(), hours = hoursSince(d.officeSyncAt), n = pendingCount(d);
  const tone = hours > 24 ? "bad" : hours > 4 ? "warn" : "ok";
  const section = route.name === "client" || route.name === "facture" ? "clients" : route.name;
  const tabs = [{ key: "clients", label: "Clients", icon: <Users size={22} /> }, { key: "valider", label: "À valider", icon: <ClipboardCheck size={22} />, count: n }, { key: "reglages", label: "Réglages", icon: <Settings size={22} /> }];
  return <div className="cx-site">
    <header className="cx-site-head cx-noprint">
      <div className="cx-site-bar">
        <div className="cx-brand"><span className="cx-logo">C</span><div><strong>CAPSED</strong><small>Contrôle</small></div></div>
        <nav className="cx-site-tabs">{tabs.map(t => <button type="button" key={t.key} className={section === t.key ? "cx-on" : ""} onClick={() => nav({ name: t.key })}>{t.label}{!!t.count && <b className="cx-count cx-tone-warn">{t.count}</b>}</button>)}</nav>
        <div className="cx-site-user"><button type="button" className="cx-icon-btn" onClick={onHelp} aria-label="Aide"><CircleHelp size={22} /></button><a href="#" className="cx-switch">Changer d’espace</a></div>
      </div>
      <div className={`cx-fresh cx-fresh-${tone}`}><span className="cx-sync-dot" />{tone === "bad" ? <>Le poste du bureau n’a pas communiqué depuis {timeFr(d.officeSyncAt)} : des saisies peuvent manquer.</> : <>Données du bureau : {ago(d.officeSyncAt)}</>}</div>
    </header>
    <main className="cx-site-main">{children}</main>
    <nav className="cx-bottom-nav cx-noprint">{tabs.map(t => <button type="button" key={t.key} className={section === t.key ? "cx-on" : ""} onClick={() => nav({ name: t.key })}>{t.icon}<span>{t.label}</span>{!!t.count && <b className="cx-count cx-tone-warn">{t.count}</b>}</button>)}</nav>
  </div>;
}

const HELP: Record<string, [string, string[]]> = {
  "facturation:factures": ["Vos factures", ["Pour facturer : cliquez sur « Nouvelle facture » (ou Ctrl+N).", "Les cases du haut montrent ce qui attend : brouillons, factures à remettre.", "Cliquez sur une facture pour l’imprimer ou voir ses paiements."]],
  "facturation:nouvelle": ["Créer une facture", ["Choisissez le client (tapez 2 lettres).", "Remplissez une ligne par prestation : le total se calcule seul.", "Vérifiez l’aperçu, puis « Émettre ». Le numéro est donné à ce moment-là."]],
  "facturation:facture": ["Une facture", ["« Imprimer » sort la facture au format CAPSED.", "« Déclarer la remise » quand le client l’a reçue.", "Une erreur ? « Plus… » puis demandez un avoir ou une annulation. Rien n’est effacé."]],
  "facturation:remises": ["Remises au client", ["Cochez les factures données au client.", "Dites comment (en main propre, déposée, e-mail) et qui l’a reçue.", "Cliquez sur « Déclarer ». Le responsable le voit tout de suite."]],
  "facturation:clients": ["Clients", ["Cherchez un client par son nom.", "« Nouveau client » pour l’ajouter.", "Une modification garde l’ancienne version dans l’historique."]],
  "facturation:client": ["Un client", ["Vous voyez ses coordonnées et ses factures.", "« Nouvelle facture » facture directement ce client.", "Pour ne plus le voir : « Plus… » puis demandez l’archivage."]],
  "facturation:demandes": ["Demandes", ["Ici, vos demandes au responsable.", "Chaque demande montre si elle est approuvée ou refusée.", "La réponse du responsable s’affiche en dessous."]],
  "encaissement:encaisser": ["À encaisser", ["Chaque client montre ce qui reste à payer.", "Cliquez sur la facture que le client a payée.", "Ou « Enregistrer un paiement » (Ctrl+N) et cherchez-la."]],
  "encaissement:paiement": ["Enregistrer un paiement", ["Choisissez la facture.", "Le montant est déjà rempli avec le reste à payer : changez-le si le paiement est partiel.", "Choisissez le mode, notez la référence, vérifiez, enregistrez."]],
  "encaissement:paiements": ["Paiements", ["La liste du jour avec son total.", "« En attente » : pas encore validés par le responsable.", "Cliquez sur un paiement pour le corriger ou le contre-passer."]],
  "encaissement:detail": ["Un paiement", ["Le jour même, avant validation, vous pouvez le corriger.", "Un doublon ? « Plus… » puis « Contre-passer » : il reste visible, barré.", "Après validation, demandez au responsable."]],
  "encaissement:demandes": ["Demandes du responsable", ["Le responsable signale un paiement dont le client parle.", "S’il est déjà saisi : « C’est celui-ci ». Sinon : « Enregistrer ce paiement ».", "Si rien n’est arrivé : « Aucun paiement trouvé » et expliquez."]],
  "responsable:clients": ["Vos clients", ["Le chiffre du haut : tout ce qui reste à recevoir.", "Les alertes montrent ce qui demande votre attention.", "Touchez un client pour voir toute son histoire."]],
  "responsable:client": ["Un client", ["Trois chiffres : facturé, reçu, reste.", "Les factures ouvertes, avec leur âge et leur remise.", "« Télécharger le relevé » pour l’envoyer ou l’imprimer."]],
  "responsable:facture": ["Une facture", ["Vous voyez si elle a été remise et ce qui a été payé.", "Le client dit avoir payé ? « Vérifier un paiement ».", "L’équipe vous répond ; le solde ne change pas tout seul."]],
  "responsable:valider": ["À valider", ["Cochez les paiements vérifiés, puis « Valider ». Ils sont alors verrouillés.", "Les demandes de correction montrent leur effet exact.", "Approuver ajoute une correction tracée ; rien n’est effacé."]],
  "responsable:reglages": ["Réglages", ["Les informations de l’entreprise.", "L’équipe et ses espaces.", "Les boutons de démonstration."]],
};
function HelpPanel({ role, route, onClose }: { role: Role; route: string; onClose: () => void }) {
  const [title, steps] = HELP[`${role}:${route}`] ?? HELP[`${role}:${HOME[role].name}`];
  return <Modal title={`Aide · ${title}`} onClose={onClose} actions={<Button kind="primary" onClick={onClose}>J’ai compris</Button>}>
    <ol className="cx-help">{steps.map((s, i) => <li key={i}><span>{i + 1}</span><p>{s}</p></li>)}</ol>
  </Modal>;
}
