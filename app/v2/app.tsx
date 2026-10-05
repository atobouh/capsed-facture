import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BriefcaseBusiness, ChartColumn, CircleHelp, ClipboardCheck, Eye, EyeOff, FileText, House, Inbox, LogOut, Settings, Users, Wallet, WifiOff } from "lucide-react";
import { Button, Modal, ToastHost, Field, Notice } from "./ui";
import { OfficeScreen } from "./office";
import type { OfficeRoute } from "./clients";
import { ResponsableScreen, pendingCount } from "./responsable";
import type { RRoute } from "./responsable";
import { ROLE_LABEL, ago, canBill, canCash, getData, receives, timeFr, useData } from "./store";
import type { Account, Role } from "./store";

const SESSION = "capsed-v2-session";
const HOME: Record<Role, OfficeRoute> = { facturation: { name: "register" }, encaissement: { name: "clients" }, bureau: { name: "register" }, responsable: { name: "clients" } };
const readSession = () => { try { return localStorage.getItem(SESSION) ?? ""; } catch { return ""; } };

export default function App() {
  const d = useData(), [sid, setSid] = useState(readSession), me = d.accounts.find(a => a.id === sid && a.active);
  const [route, setRoute] = useState<OfficeRoute>(() => HOME[me?.role ?? "facturation"]), [help, setHelp] = useState(false);
  // The office window scrolls inside its work area; the Direction site scrolls the page.
  const nav = useCallback((r: OfficeRoute) => { setRoute(r); window.scrollTo(0, 0); document.getElementById("contenu")?.scrollTo(0, 0); }, []);
  useEffect(() => { document.title = me ? `CAPSED, ${ROLE_LABEL[me.role]}` : "CAPSED, Connexion"; }, [me]);
  function signIn(a: Account) { try { localStorage.setItem(SESSION, a.id); } catch { /* session non conservée */ } setSid(a.id); setRoute(HOME[a.role]); window.scrollTo(0, 0); }
  function signOut() { try { localStorage.removeItem(SESSION); } catch { /* rien */ } setSid(""); }
  if (!me) return <div className="cx-app"><SignIn onSignIn={signIn} /><ToastHost /></div>;
  return <div className={`cx-app cx-role-${me.role}`}>
    {me.role === "responsable"
      ? <SiteShell me={me} route={route} nav={nav} onHelp={() => setHelp(true)} onSignOut={signOut}><ResponsableScreen route={route as RRoute} nav={nav as (r: RRoute) => void} by={me.id} /></SiteShell>
      : <OfficeShell me={me} route={route} nav={nav} onHelp={() => setHelp(true)} onSignOut={signOut}><OfficeScreen role={me.role} by={me.id} route={route} nav={nav} /></OfficeShell>}
    {help && <HelpPanel role={me.role} route={route.name} onClose={() => setHelp(false)} />}
    <ToastHost />
  </div>;
}

function SignIn({ onSignIn }: { onSignIn: (a: Account) => void }) {
  const [login, setLogin] = useState(""), [password, setPassword] = useState(""), [show, setShow] = useState(false), [error, setError] = useState("");
  const demo = ["u-awa", "u-paul", "u-bureau", "u-dir"].map(id => getData().accounts.find(a => a.id === id)).filter((a): a is Account => !!a);
  function submit() {
    const a = getData().accounts.find(x => x.login.toLowerCase() === login.trim().toLowerCase());
    if (!login.trim() || !password) return setError("Saisissez votre identifiant et votre mot de passe.");
    if (!a || a.password !== password.trim()) return setError("Identifiant ou mot de passe incorrect. Vérifiez la fiche remise par le responsable.");
    if (!a.active) return setError("Ce compte est désactivé. Adressez-vous au responsable.");
    onSignIn(a);
  }
  const icon = (r: Role) => r === "facturation" ? <FileText size={20} /> : r === "encaissement" ? <Wallet size={20} /> : r === "bureau" ? <BriefcaseBusiness size={20} /> : <ClipboardCheck size={20} />;
  return <main className="cx-signin">
    <section className="cx-signin-brand">
      <img src="capsed-logo.png" alt="Logo CAPSED" className="cx-signin-logo" />
      <h1>CAPSED SUARL</h1>
      <p>Facturation, encaissement et suivi des clients.</p>
      <ul><li><FileText size={17} /> La facturation crée, imprime et remet les factures.</li><li><Wallet size={17} /> L’encaissement enregistre chaque paiement.</li><li><ClipboardCheck size={17} /> Le responsable suit tout, sans appeler le bureau.</li></ul>
      <small>Rien n’est jamais supprimé : chaque correction reste visible dans l’historique.</small>
    </section>
    <section className="cx-signin-panel">
      <form className="cx-signin-form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <h2>Connexion</h2>
        <p className="cx-muted">Utilisez l’identifiant et le mot de passe remis par le responsable.</p>
        <Field label="Identifiant"><input className="cx-input" value={login} autoFocus autoComplete="username" onChange={e => { setLogin(e.target.value); setError(""); }} placeholder="Ex. awa" /></Field>
        <Field label="Mot de passe"><div className="cx-password"><input className="cx-input" type={show ? "text" : "password"} value={password} autoComplete="current-password" onChange={e => { setPassword(e.target.value); setError(""); }} /><button type="button" className="cx-icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button kind="primary" type="submit" wide>Se connecter</Button>
      </form>
      <div className="cx-demo-access">
        <p><strong>Démonstration</strong>, données fictives dans ce navigateur. Essayez un espace :</p>
        <div className="cx-demo-cards">{demo.map(a => <button type="button" key={a.id} className={`cx-demo-card cx-demo-${a.role}`} onClick={() => onSignIn(a)}><span className="cx-demo-icon">{icon(a.role)}</span><span><strong>{ROLE_LABEL[a.role]}</strong><small>{a.name}, {a.role === "responsable" ? "site de contrôle" : "application de bureau"}</small></span></button>)}</div>
        <p className="cx-hint">Identifiants de démonstration : awa / CAP-7421, paul / CAP-5308, rose / CAP-4826, direction / CAP-9160</p>
      </div>
    </section>
  </main>;
}

function OfficeShell({ me, route, nav, onHelp, onSignOut, children }: { me: Account; route: OfficeRoute; nav: (r: OfficeRoute) => void; onHelp: () => void; onSignOut: () => void; children: ReactNode }) {
  const d = useData(), inbox = d.requests.filter(r => receives(me.role, r.to) && r.receivedAt && !r.resolvedAt).length, bill = canBill(me.role), cash = canCash(me.role);
  // Every office tab is listed once; the login decides which ones show.
  const items: { key: string; label: string; icon: ReactNode; show: boolean; count?: number }[] = [
    { key: "register", label: "Factures", icon: <FileText size={20} aria-hidden="true" />, show: bill },
    { key: "clients", label: cash ? "Clients et paiements" : "Clients", icon: cash ? <Wallet size={20} aria-hidden="true" /> : <Users size={20} aria-hidden="true" />, show: true },
    { key: "inbox", label: "Demandes", icon: <Inbox size={20} aria-hidden="true" />, show: true, count: inbox },
  ];
  const section = ["compose", "invoice", "credit"].includes(route.name) ? (bill ? "register" : "clients") : ["client", "situation"].includes(route.name) ? "clients" : route.name;
  // Desktop shortcuts: F1 help, Ctrl+F search on this page, Ctrl+N new invoice (Facturation).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector(".cx-overlay")) return;
      if (e.key === "F1") { e.preventDefault(); onHelp(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { const box = document.querySelector<HTMLInputElement>("#contenu .cx-search input"); if (box) { e.preventDefault(); box.focus(); box.select(); } }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && canBill(me.role) && route.name !== "compose") { e.preventDefault(); nav({ name: "compose" }); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [me.role, nav, onHelp, route.name]);
  return <div className="cx-office">
    <aside className="cx-sidebar cx-noprint">
      <div className="cx-brand"><img src="capsed-logo.png" alt="" width="32" height="32" className="cx-brand-logo" /><div><strong>CAPSED</strong><small>{ROLE_LABEL[me.role]}</small></div></div>
      <nav aria-label="Navigation principale">{items.filter(i => i.show).map(i => <button type="button" key={i.key} aria-current={section === i.key ? "page" : undefined} className={section === i.key ? "cx-on" : ""} onClick={() => nav({ name: i.key })}>{i.icon}<span>{i.label}</span>{!!i.count && <b className="cx-count" aria-label={`${i.count} à traiter`}>{i.count}</b>}</button>)}</nav>
      <div className="cx-sidebar-foot">
        <p className={`cx-sync${d.officeOnline ? "" : " cx-sync-off"}`}>{d.officeOnline ? <><span className="cx-sync-dot" aria-hidden="true" />Synchronisé avec la Direction</> : <><WifiOff size={14} aria-hidden="true" />Hors ligne, saisies gardées ici</>}</p>
        <div className="cx-user"><span className="cx-avatar" aria-hidden="true">{initials(me.name)}</span><div><strong>{me.name}</strong><button type="button" onClick={onSignOut}>Se déconnecter</button></div></div>
      </div>
    </aside>
    <main className="cx-content" id="contenu" tabIndex={-1}>{children}</main>
    <footer className="cx-statusbar cx-noprint">
      <span>Données enregistrées sur ce poste</span>
      <span className="cx-status-keys" aria-hidden="true">{bill && <span><kbd>Ctrl</kbd> <kbd>N</kbd> nouvelle facture</span>}<span><kbd>Ctrl</kbd> <kbd>F</kbd> chercher</span></span>
      <button type="button" onClick={onHelp}><CircleHelp size={15} aria-hidden="true" />Aide <kbd>F1</kbd></button>
    </footer>
  </div>;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const today = () => { const t = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); };

function SiteShell({ me, route, nav, onHelp, onSignOut, children }: { me: Account; route: OfficeRoute; nav: (r: OfficeRoute) => void; onHelp: () => void; onSignOut: () => void; children: ReactNode }) {
  const d = useData(), n = pendingCount(d), home = route.name === "clients";
  const section = route.name === "client" ? "clients" : route.name === "facture" ? (route.extra === "factures" ? "factures" : "clients") : route.name === "valider" ? "factures" : route.name;
  const tabs = [{ key: "clients", label: "Accueil", icon: <House size={21} aria-hidden="true" /> }, { key: "factures", label: "Factures", icon: <FileText size={21} aria-hidden="true" />, count: n }, { key: "situation", label: "Situation", icon: <ChartColumn size={21} aria-hidden="true" /> }, { key: "reglages", label: "Réglages", icon: <Settings size={21} aria-hidden="true" /> }];
  return <div className="cx-site">
    <header className="cx-site-head cx-noprint">
      <div className="cx-site-bar">
        <button type="button" className="cx-brand" onClick={() => nav({ name: "clients" })}><img src="capsed-logo.png" alt="" width="30" height="30" className="cx-brand-logo" /><span><strong>CAPSED</strong><small>{today()}</small></span></button>
        <nav className="cx-site-tabs" aria-label="Navigation principale">{tabs.map(t => <button type="button" key={t.key} aria-current={section === t.key ? "page" : undefined} className={section === t.key ? "cx-on" : ""} onClick={() => nav({ name: t.key })}>{t.label}{!!t.count && <b className="cx-count">{t.count}</b>}</button>)}</nav>
        <div className="cx-site-user"><button type="button" className="cx-round-btn" onClick={onHelp} aria-label="Aide sur cette page" title="Aide"><CircleHelp size={19} /></button><button type="button" className="cx-round-btn" onClick={onSignOut} aria-label={`Se déconnecter (${me.name})`} title="Se déconnecter"><LogOut size={18} /></button></div>
      </div>
    </header>
    <main className="cx-site-main" id="contenu">
      {!home && <p className={`cx-fresh${!d.officeOnline ? " cx-fresh-stale" : ""}`}>{!d.officeOnline ? <><WifiOff size={14} aria-hidden="true" />Bureau hors ligne. Dernières nouvelles {timeFr(d.snapshot.receivedAt)}</> : <><span className="cx-sync-dot" aria-hidden="true" />Données du bureau reçues {ago(d.snapshot.receivedAt)}</>}</p>}
      {children}
    </main>
    <nav className="cx-bottom-nav cx-noprint" aria-label="Navigation principale">{tabs.map(t => <button type="button" key={t.key} aria-current={section === t.key ? "page" : undefined} className={section === t.key ? "cx-on" : ""} onClick={() => nav({ name: t.key })}>{t.icon}<span>{t.label}</span>{!!t.count && <b className="cx-count">{t.count}</b>}</button>)}</nav>
  </div>;
}

const HELP: Record<string, [string, [string, string][]]> = {
  "facturation:register": ["Factures & avoirs", [["Créer", "Cliquez sur « Nouvelle facture », choisissez le client et ajoutez les prestations."], ["Consulter", "Cliquez une facture pour voir ses détails à droite. La flèche ou un double-clic ouvre le document."], ["Changer de période", "Choisissez le mois en haut. « Clôturer ce mois » ferme la période et ouvre la suivante. L’onglet Avoirs réunit les corrections de factures."]]],
  "facturation:compose": ["Créer une facture", [["Client", "Choisissez un client enregistré. Ses coordonnées sont reprises automatiquement."], ["Articles", "Saisissez la désignation, la quantité et le prix hors taxe. Ajoutez un article pour chaque prestation ; contrat et destination sont facultatifs."], ["Émission", "Réglez la remise, la TVA et l’avance, vérifiez l’aperçu, puis « Émettre la facture » : le numéro est attribué à ce moment."]]],
  "facturation:invoice": ["Consulter une facture", [["Imprimer", "« Imprimer / PDF » ouvre l’impression et permet d’enregistrer un PDF."], ["Remettre", "« Marquer comme remise au client » après l’avoir donnée au client."], ["Corriger", "« Modifier la facture » garde le numéro et la version précédente. « Créer un avoir » réduit le montant facturé."]]],
  "facturation:credit": ["Consulter un avoir", [["Origine", "« Voir la facture d’origine » ouvre le document concerné."], ["Compte client", "L’avoir réduit le montant facturé ; le compte du client affiche le nouveau solde."], ["Imprimer", "« Imprimer / PDF » pour imprimer ou enregistrer ce document."]]],
  "facturation:clients": ["Clients", [["Chercher", "Tapez le nom du client. Les filtres montrent les clients avec un reste à payer ou archivés."], ["Ajouter", "« Ajouter un client » : seul le nom est obligatoire."], ["Ouvrir", "Le compte du client réunit toutes ses factures, avoirs et paiements."]]],
  "facturation:client": ["Compte client", [["Factures", "« Nouvelle facture » facture directement ce client."], ["Avoirs", "« Créer un avoir » sur la ligne de la facture concernée."], ["Archiver", "Un client archivé quitte la liste active ; rien n’est supprimé et il peut être réactivé."]]],
  "facturation:inbox": ["Demandes du responsable", [["Recevoir", "Le responsable demande un nouveau client."], ["Créer", "Ouvrez la demande puis « Créer le client » : la demande est marquée traitée."], ["Répondre", "Si rien n’est à créer, écrivez le résultat et marquez la demande comme traitée."]]],
  "encaissement:clients": ["Clients & paiements", [["Choisir un client", "Ouvrez son compte pour retrouver toutes ses factures, même celles des mois clôturés."], ["Recevoir un paiement", "« Enregistrer un paiement » : choisissez la facture, le montant et le mode."], ["Suivre le solde", "Le reste à payer se recalcule. Une saisie erronée peut être annulée ; elle reste visible."]]],
  "encaissement:client": ["Compte client", [["Encaisser", "« Ajouter un paiement » sur la ligne de la facture payée."], ["Corriger", "« Modifier » garde l’ancienne valeur dans l’historique. « Annuler une erreur » laisse l’entrée visible, barrée."], ["Verrou", "Un paiement validé par le responsable ne peut plus être modifié."]]],
  "encaissement:situation": ["Relevé du client", [["Période", "Choisissez les dates du relevé."], ["Exporter", "Excel ou CSV si le client le demande."], ["Imprimer", "« Imprimer » sort le relevé sur le papier CAPSED."]]],
  "encaissement:inbox": ["Demandes du responsable", [["Recevoir", "Le responsable signale un paiement dont le client parle."], ["Vérifier", "Ouvrez la facture. Si le paiement est déjà saisi, répondez-le ; sinon « Vérifier / enregistrer le paiement »."], ["Répondre", "Le solde change uniquement lors d’une écriture de paiement, jamais par la demande."]]],
  "responsable:clients": ["Vos clients", [["Consulter", "Le chiffre du haut : tout ce qui reste à recevoir, selon le dernier état reçu du bureau."], ["Alertes", "Paiements à valider, factures en retard, demandes en cours."], ["Demander", "« Demander un client » ou, depuis un client, « Signaler un paiement »."]]],
  "responsable:factures": ["Factures", [["Nouveau à valider", "Les nouvelles factures et les nouveaux paiements du bureau sont en haut. Cochez ce que vous avez contrôlé, puis « Valider ». Rien n’attend votre validation : tout compte déjà dans les soldes et la situation."], ["Mois", "Les flèches changent de mois. Toutes les factures restent consultables, même celles des mois clôturés."], ["Ouvrir", "Touchez une facture pour voir le document entier, ses paiements et s’il a été remis au client. La recherche couvre tous les mois."]]],
  "responsable:client": ["Un client", [["Solde", "Reste à recevoir, facturé et reçu."], ["Factures", "Touchez une facture pour voir son total, ses paiements et si elle a été remise."], ["Paiements", "« Valider » verrouille un paiement : l’équipe ne peut plus le modifier."]]],
  "responsable:facture": ["Une facture", [["Remise", "Vous voyez si l’équipe a déclaré la facture remise au client."], ["Paiements", "Chaque paiement indique qui l’a saisi et s’il est validé."], ["Signaler", "Le client dit avoir payé ? « Signaler un paiement » : l’encaissement vérifie."]]],
  "responsable:reglages": ["Réglages", [["Équipe", "Ajoutez un membre : l’identifiant et le mot de passe sont créés pour vous. Remettez la fiche en main propre."], ["Entreprise et facture", "Modifiez les coordonnées ou la bannière, puis « Enregistrer ». Cela vaut pour les prochaines factures."], ["Sauvegarde", "Téléchargez une sauvegarde chaque semaine. Elle se restaure sur un autre poste."]]],
  "responsable:situation": ["Situation", [["Qui", "Tous les clients, ou un seul client."], ["Période", "Choisissez les dates."], ["Sortir", "Imprimer, Excel ou CSV."]]],
};
function HelpPanel({ role, route, onClose }: { role: Role; route: string; onClose: () => void }) {
  // The full office mode reuses the Facturation and Encaissement help.
  const keys: Role[] = role === "bureau" ? ["facturation", "encaissement"] : [role];
  const [title, steps] = keys.map(k => HELP[`${k}:${route}`]).find(Boolean) ?? HELP[`${keys[0]}:${HOME[keys[0]].name}`];
  return <Modal title={title} subtitle="Les gestes essentiels" onClose={onClose} actions={<Button kind="primary" onClick={onClose}>J’ai compris</Button>}>
    <ol className="cx-help">{steps.map(([t, s], i) => <li key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{s}</p></div></li>)}</ol>
  </Modal>;
}
