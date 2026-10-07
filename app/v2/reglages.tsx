/** Réglages: five short pages instead of one long one. Each page answers one question. */
import { useEffect, useState } from "react";
import { BookOpen, Building2, Check, ChevronRight, Copy, Download, Eye, EyeOff, FileUp, Database, KeyRound, Monitor, ShieldCheck, UserPlus, Users, WifiOff, Trash2 } from "lucide-react";
import { BinPage } from "./corbeille";
import { Button, Choice, Confirm, Empty, Field, Modal, Notice, PageHead, Row, TextArea, TextInput, toast } from "./ui";
import { BackupSettings, CompanySettings, FormatSettings, TermSettings } from "./settings";
import { ACTIONS, liftRule, undoOverride } from "./overrides";
import { makeHash } from "./password";
import { CLOUD, MODE, ROLE_LABEL, accountName, ago, commit, generateLogin, generatePassword, getData, monthLabel, nowIso, resetDemo, setOnline, timeFr, uid, useData } from "./store";
import type { Account, Override, Role } from "./store";
import { useSync } from "./sync";
import { ManualOverlay } from "./app";
import { useInstall } from "./install";
import { exportAll } from "./export-all";
import { ImportClients } from "./import-clients";
import { fetchJson } from "./net";
import type { DeviceStatus } from "./sync";

type Nav = (r: { name: "reglages"; id?: string }) => void;
const PAGES = [
  { key: "equipe", title: "Équipe et accès", sub: CLOUD ? "Personnes, mots de passe, ordinateurs du bureau" : "Personnes et mots de passe", icon: <Users size={18} aria-hidden="true" /> },
  { key: "regles", title: "Règles et dérogations", sub: "Délai de paiement, mois clôturés, retour en arrière", icon: <ShieldCheck size={18} aria-hidden="true" /> },
  { key: "entreprise", title: "Entreprise et factures", sub: "Coordonnées et en-tête imprimés", icon: <Building2 size={18} aria-hidden="true" /> },
  { key: "corbeille", title: "Éléments supprimés", sub: "Clients, factures et paiements supprimés, à restaurer", icon: <Trash2 size={18} aria-hidden="true" /> },
  { key: "donnees", title: "Données et sauvegarde", sub: CLOUD ? "Envois des postes, sauvegarde, restauration" : "Sauvegarde et restauration", icon: <Database size={18} aria-hidden="true" /> },
  { key: "aide", title: "Aide", sub: "Les gestes essentiels et quoi faire en cas de souci", icon: <BookOpen size={18} aria-hidden="true" /> },
];

export function Reglages({ page, nav, by }: { page?: string; nav: Nav; by: string }) {
  const p = PAGES.find(x => x.key === page);
  if (!p) return <div className="cx-page cx-reglages">
    <PageHead title="Réglages" />
    <div className="cx-card cx-card-flush cx-rows">{PAGES.map(x => <Row key={x.key} lead={<span className="cx-task-icon">{x.icon}</span>} title={x.title} sub={<span>{x.sub}</span>} state={<ChevronRight size={18} className="cx-go" aria-hidden="true" />} onClick={() => nav({ name: "reglages", id: x.key })} />)}</div>
  </div>;
  return <div className="cx-page cx-reglages">
    <PageHead back={{ label: "Réglages", onClick: () => nav({ name: "reglages" }) }} title={p.title} />
    {p.key === "equipe" && <><Team by={by} />{CLOUD && <Devices />}{MODE === "site" && <Sessions />}</>}
    {p.key === "regles" && <Rules by={by} />}
    {p.key === "corbeille" && <BinPage by={by} />}
    {p.key === "entreprise" && <><CompanySettings by={by} /><FormatSettings by={by} /></>}
    {p.key === "donnees" && <>{CLOUD && <SyncStatus />}<ExportAll /><ClientImport by={by} /><BackupSettings by={by} />{MODE === "demo" && <DemoTools />}</>}
    {p.key === "aide" && <Help />}
  </div>;
}

// ——— Équipe et accès ———
/** In the real app only a salted hash of the password is kept; the demo keeps it readable. */
async function withPassword(a: Account, password: string): Promise<Account> {
  if (!CLOUD) return { ...a, password };
  const { password: _p, ...rest } = a; void _p;
  // Kept readable for the Direction (it can give it back); office computers only receive the hash.
  return { ...rest, ...(await makeHash(password)), visiblePassword: password, passwordAt: nowIso() };
}
const shownPassword = (a: Account) => a.visiblePassword ?? a.password;
const ROLE_OPTIONS: { value: Role; label: string; sub: string }[] = [{ value: "facturation", label: "Facturation", sub: "Factures, avoirs, clients" }, { value: "encaissement", label: "Encaissement", sub: "Paiements" }, { value: "bureau", label: "Facturation et encaissement", sub: "Tout le bureau, une seule connexion" }, { value: "responsable", label: "Direction", sub: "Ce site" }];
function copy(text: string, done = "Copié.") { navigator.clipboard?.writeText(text).then(() => toast(done)).catch(() => toast("Copie impossible : recopiez-le à la main.", "warn")); }
function PasswordLine({ a, onSet }: { a: Account; onSet: () => void }) {
  const [show, setShow] = useState(false), pw = shownPassword(a);
  // Passwords made before they were kept for the Direction cannot be shown: one click sets a new one.
  if (!pw) return <small className="cx-pw-line">Mot de passe : pas encore visible ici. <button type="button" className="cx-link-btn" onClick={onSet}><KeyRound size={13} aria-hidden="true" />Définir le mot de passe</button></small>;
  return <small className="cx-pw-line">Mot de passe : <code translate="no">{show ? pw : "••••••••"}</code>
    <button type="button" className="cx-icon-mini" onClick={() => setShow(s => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} title={show ? "Masquer" : "Afficher"}>{show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}</button>
    <button type="button" className="cx-icon-mini" onClick={() => copy(pw, `Mot de passe de ${a.name} copié.`)} aria-label={`Copier le mot de passe de ${a.name}`} title="Copier le mot de passe"><Copy size={15} aria-hidden="true" /></button></small>;
}
/** Made by the app (easy to read and type) or chosen by the Direction. */
function PasswordChoice({ mode, setMode, custom, setCustom, error }: { mode: "auto" | "custom"; setMode: (m: "auto" | "custom") => void; custom: string; setCustom: (v: string) => void; error?: string }) {
  return <>
    <Field label="Mot de passe" required><Choice columns={2} value={mode} onChange={setMode} options={[{ value: "auto", label: "Créé par l’application", sub: "Facile à lire, ex. soleil-4821" }, { value: "custom", label: "Je le choisis", sub: "Au moins 6 caractères" }]} /></Field>
    {mode === "custom" && <Field label="Mot de passe choisi" error={error} hint="Visible ici pour la Direction ; vous pourrez le revoir et le copier à tout moment."><TextInput value={custom} onChange={setCustom} autoFocus placeholder="Ex. Douala2026" /></Field>}
  </>;
}
const passwordError = (mode: "auto" | "custom", custom: string) => mode === "custom" && custom.trim().length < 6 ? "Au moins 6 caractères." : mode === "custom" && /\s/.test(custom.trim()) ? "Sans espace, pour éviter les erreurs de saisie." : "";
function Team({ by }: { by: string }) {
  const d = useData(), [add, setAdd] = useState(false), [sheet, setSheet] = useState<{ a: Account; password?: string } | null>(null), [reset, setReset] = useState<Account | null>(null), [toggle, setToggle] = useState<Account | null>(null), [edit, setEdit] = useState<Account | null>(null), [remove, setRemove] = useState<Account | null>(null);
  const team = d.accounts.filter(a => !a.deletedAt), removed = d.accounts.length - team.length;
  return <section className="cx-section" aria-labelledby="set-team">
    <div className="cx-section-head cx-section-head-row"><div><h2 id="set-team">Équipe</h2><p>Chacun se connecte avec l’identifiant et le mot de passe que vous lui remettez. Vous pouvez les revoir ici à tout moment.</p></div><Button icon={<UserPlus size={17} aria-hidden="true" />} onClick={() => setAdd(true)}>Ajouter une personne</Button></div>
    <div className="cx-panel cx-list">{team.map(a => <div key={a.id} className={`cx-list-row cx-static cx-member${a.active ? "" : " cx-cancelled"}`}>
      <span className="cx-list-main"><strong>{a.name}{!a.active && <span className="cx-chip">Désactivé</span>}</strong>
        <small>{ROLE_LABEL[a.role]} · identifiant <span translate="no">{a.login}</span>{a.email ? ` · ${a.email}` : ""}</small>
        <PasswordLine a={a} onSet={() => setReset(a)} /></span>
      <span className="cx-list-actions">
        <button type="button" className="cx-text-btn" onClick={() => setEdit(a)}>Modifier</button>
        <button type="button" className="cx-text-btn" onClick={() => setSheet({ a, password: shownPassword(a) })}>Fiche d’accès</button>
        <button type="button" className="cx-text-btn" onClick={() => setReset(a)}><KeyRound size={15} aria-hidden="true" />Nouveau mot de passe</button>
        {a.id !== by && <button type="button" className="cx-text-btn" onClick={() => setToggle(a)}>{a.active ? "Désactiver" : "Réactiver"}</button>}
        {a.id !== by && !a.active && <button type="button" className="cx-text-btn cx-text-bad" onClick={() => setRemove(a)}>Supprimer</button>}</span>
    </div>)}{!team.length && <p className="cx-fold-note">Personne pour l’instant.</p>}</div>
    {removed > 0 && <p className="cx-fold-note">{removed === 1 ? "Une personne supprimée" : `${removed} personnes supprimées`} : leur nom reste dans l’historique des factures et paiements qu’elles ont saisis.</p>}
    {add && <AddMember by={by} onClose={() => setAdd(false)} onCreated={(a, password) => { setAdd(false); setSheet({ a, password }); }} />}
    {edit && <EditMember a={edit} self={edit.id === by} by={by} onClose={() => setEdit(null)} />}
    {sheet && <CredentialSheet a={sheet.a} password={sheet.password} onClose={() => setSheet(null)} />}
    {reset && <SetPassword a={reset} self={reset.id === by} by={by} onClose={() => setReset(null)} onDone={(a, pw) => { setReset(null); setSheet({ a, password: pw }); }} />}
    {remove && <Confirm title={`Supprimer ${remove.name} ?`} confirm="Supprimer définitivement" cancel="Garder" onClose={() => setRemove(null)} onConfirm={() => {
      const { password: _p, visiblePassword: _v, pwHash: _h, pwSalt: _s, pwIter: _i, email: _e, ...keep } = remove; void _p; void _v; void _h; void _s; void _i; void _e;
      const gone: Account = { ...keep, active: false, login: `supprime-${remove.id.slice(0, 8)}`, deletedAt: nowIso() };
      commit(by, x => ({ accounts: x.accounts.map(a => a.id === remove.id ? gone : a) }), { text: `Compte de ${remove.name} supprimé` });
      setRemove(null); toast(`${remove.name} a été supprimé(e) de l’équipe.`);
    }}><p>Cette personne disparaît de l’équipe et ne pourra plus jamais se connecter : son identifiant et son mot de passe sont effacés, sur ce site et sur les ordinateurs du bureau.</p><p>Les factures et paiements qu’elle a saisis restent, avec son nom, dans l’historique. Cette suppression ne peut pas être annulée.</p></Confirm>}
    {toggle && <Confirm title={toggle.active ? `Désactiver ${toggle.name} ?` : `Réactiver ${toggle.name} ?`} confirm={toggle.active ? "Désactiver" : "Réactiver"} cancel="Annuler" onClose={() => setToggle(null)} onConfirm={() => { commit(by, x => ({ accounts: x.accounts.map(a => a.id === toggle.id ? { ...a, active: !a.active } : a) }), { text: `Compte de ${toggle.name} ${toggle.active ? "désactivé" : "réactivé"}` }); setToggle(null); toast(toggle.active ? "Compte désactivé." : "Compte réactivé."); }}><p>{toggle.active ? "Cette personne ne pourra plus se connecter. Ce qu’elle a saisi reste dans l’historique." : "Cette personne pourra de nouveau se connecter."}</p></Confirm>}
  </section>;
}
function SetPassword({ a, self, by, onClose, onDone }: { a: Account; self: boolean; by: string; onClose: () => void; onDone: (a: Account, password: string) => void }) {
  const [mode, setMode] = useState<"auto" | "custom">("auto"), [custom, setCustom] = useState(""), [tried, setTried] = useState(false), [busy, setBusy] = useState(false);
  const error = tried ? passwordError(mode, custom) : "";
  async function save() {
    setTried(true); if (passwordError(mode, custom)) return;
    setBusy(true);
    const pw = mode === "custom" ? custom.trim() : generatePassword(), next = await withPassword(a, pw);
    commit(by, x => ({ accounts: x.accounts.map(y => y.id === a.id ? { ...next, passwordAt: nowIso() } : y) }), { text: `Nouveau mot de passe pour ${a.name}` });
    onDone(next, pw);
  }
  return <Modal side title={`Mot de passe de ${a.name}`} subtitle={self ? "Vous l’utiliserez à votre prochaine connexion." : "L’ancien ne marchera plus. Les ordinateurs du bureau reçoivent le nouveau en quelques secondes."} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" disabled={busy} onClick={save}>Enregistrer le mot de passe</Button></>}>
    <PasswordChoice mode={mode} setMode={m => { setMode(m); setTried(false); }} custom={custom} setCustom={v => { setCustom(v); setTried(false); }} error={error} />
  </Modal>;
}
function EditMember({ a, self, by, onClose }: { a: Account; self: boolean; by: string; onClose: () => void }) {
  const [name, setName] = useState(a.name), [email, setEmail] = useState(a.email ?? ""), [role, setRole] = useState<Role>(a.role), [error, setError] = useState("");
  function save() {
    if (!name.trim()) return setError("Écrivez le nom de la personne.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Adresse e-mail invalide.");
    const changes = [name.trim() !== a.name && "nom", (email.trim() || undefined) !== a.email && "e-mail", role !== a.role && "rôle"].filter(Boolean);
    if (!changes.length) return onClose();
    commit(by, x => ({ accounts: x.accounts.map(y => y.id === a.id ? { ...y, name: name.trim(), email: email.trim() || undefined, role } : y) }), { text: `Compte de ${name.trim()} modifié (${changes.join(", ")})` });
    toast("Modifications enregistrées."); onClose();
  }
  return <Modal side title={`Modifier ${a.name}`} subtitle={`Identifiant : ${a.login}. Il ne change pas.`} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={save}>Enregistrer</Button></>}>
    <Field label="Nom et prénom" required><TextInput value={name} onChange={v => { setName(v); setError(""); }} autoFocus /></Field>
    <Field label="E-mail" optional><TextInput value={email} onChange={v => { setEmail(v); setError(""); }} inputMode="email" placeholder="Ex. awa@capsed.cm" /></Field>
    {self ? <p className="cx-muted">Votre propre rôle ne se change pas ici, pour ne pas perdre l’accès à la Direction.</p>
      : <Field label="Que fait-elle ?" required><Choice columns={2} value={role} onChange={v => { setRole(v as Role); setError(""); }} options={ROLE_OPTIONS} /></Field>}
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}
function AddMember({ by, onClose, onCreated }: { by: string; onClose: () => void; onCreated: (a: Account, password: string) => void }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [role, setRole] = useState<Role | "">(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"auto" | "custom">("auto"), [custom, setCustom] = useState(""), [tried, setTried] = useState(false);
  async function create() {
    if (!name.trim()) return setError("Écrivez le nom de la personne."); if (!role) return setError("Choisissez ce qu’elle fera.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Adresse e-mail invalide.");
    setTried(true); if (passwordError(mode, custom)) return;
    setBusy(true);
    const pw = mode === "custom" ? custom.trim() : generatePassword(), base: Account = { id: uid(), name: name.trim(), role, login: generateLogin(name, getData().accounts), email: email.trim() || undefined, active: true, createdAt: nowIso(), passwordAt: nowIso() };
    const a = await withPassword(base, pw);
    commit(by, x => ({ accounts: [...x.accounts, a] }), { text: `Compte créé pour ${a.name} (${ROLE_LABEL[a.role]})` }); onCreated(a, pw);
  }
  return <Modal side title="Ajouter une personne" subtitle="L’identifiant est créé pour vous ; le mot de passe aussi, ou vous le choisissez." onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" disabled={busy} onClick={create}>Créer son accès</Button></>}>
    <Field label="Nom et prénom" required><TextInput value={name} onChange={v => { setName(v); setError(""); }} autoFocus placeholder="Ex. Marie Ndjock…" /></Field>
    <Field label="E-mail" optional><TextInput value={email} onChange={setEmail} inputMode="email" placeholder="Ex. awa@capsed.cm" /></Field>
    <Field label="Que fera-t-elle ?" required><Choice columns={2} value={role} onChange={v => { setRole(v as Role); setError(""); }} options={ROLE_OPTIONS} /></Field>
    <PasswordChoice mode={mode} setMode={m => { setMode(m); setTried(false); }} custom={custom} setCustom={v => { setCustom(v); setTried(false); }} error={tried ? passwordError(mode, custom) : ""} />
    {error && <Notice tone="bad">{error}</Notice>}
  </Modal>;
}
function CredentialSheet({ a, password, onClose }: { a: Account; password?: string; onClose: () => void }) {
  const text = `CAPSED, accès de ${a.name}\nEspace : ${ROLE_LABEL[a.role]}\nIdentifiant : ${a.login}${password ? `\nMot de passe : ${password}` : ""}`;
  return <Modal title={`Accès de ${a.name}`} subtitle="Remettez ces informations à cette personne uniquement." onClose={onClose} actions={<><Button kind="quiet" icon={<Copy size={16} aria-hidden="true" />} onClick={() => copy(text)}>Copier la fiche</Button><Button kind="primary" onClick={onClose}>C’est noté</Button></>}>
    <dl className="cx-credential"><div><dt>Espace</dt><dd>{ROLE_LABEL[a.role]}</dd></div><div><dt>Identifiant</dt><dd translate="no">{a.login}</dd></div><div><dt>Mot de passe</dt><dd translate="no">{password ? <span className="cx-pw-sheet">{password}<button type="button" className="cx-icon-mini" onClick={() => copy(password, "Mot de passe copié.")} aria-label="Copier le mot de passe" title="Copier le mot de passe"><Copy size={15} aria-hidden="true" /></button></span> : "pas encore visible : « Définir le mot de passe »"}</dd></div></dl>
    <p className="cx-muted">{a.role === "responsable" ? "Se connecte sur ce site." : "Se connecte dans l’application de bureau, sur un ordinateur relié."} Vous retrouvez cette fiche à tout moment dans Réglages, Équipe et accès.</p>
  </Modal>;
}

function api<T>(path: string, body?: unknown): Promise<T> {
  return fetchJson<T>(path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-capsed": "1" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" }, { tries: body === undefined ? 3 : 1, timeout: 30_000 });
}
const series = (l: string) => l ? `série ${l} (2026-10-${l}001…)` : "série principale (2026-10-001…)";
function Devices() {
  const [list, setList] = useState<{ devices: DeviceStatus[]; codes: { letter: string; expires_at: string }[] } | null>(null), [error, setError] = useState(""), [code, setCode] = useState<{ code: string; letter: string; expiresAt: string; createdAt: string } | null>(null), [revoke, setRevoke] = useState<DeviceStatus | null>(null), [busy, setBusy] = useState(false);
  const load = () => api<typeof list>("/api/devices").then(r => { setList(r); setError(""); }).catch(e => setError((e as Error).message));
  // The list keeps itself up to date: every few seconds while a code waits to be typed, otherwise every 20 seconds.
  const waitingCode = !!code || !!list?.codes.length;
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, waitingCode ? 4_000 : 20_000);
    return () => clearInterval(t);
  }, [waitingCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = list?.devices.filter(d => !d.revoked_at) ?? [];
  // The computer that just used the code shown on screen.
  const linked = code ? active.find(d => d.created_at >= code.createdAt) : undefined;
  return <section className="cx-section" aria-labelledby="set-devices">
    <div className="cx-section-head cx-section-head-row"><div><h2 id="set-devices">Ordinateurs du bureau</h2><p>Chaque ordinateur est relié une fois avec un code. Il travaille ensuite sans internet ; ses factures ont leur propre série de numéros.</p></div>
      <Button icon={<Monitor size={17} aria-hidden="true" />} disabled={busy} onClick={async () => { setBusy(true); try { setCode({ ...await api<{ code: string; letter: string; expiresAt: string }>("/api/devices/code", {}), createdAt: new Date(Date.now() - 60_000).toISOString() }); void load(); } catch (e) { toast((e as Error).message, "warn"); } finally { setBusy(false); } }}>Relier un ordinateur</Button></div>
    {error && <Notice tone="warn">{error}</Notice>}
    <div className="cx-panel cx-list">{active.map(d => <div key={d.id} className="cx-list-row cx-static">
      <span className="cx-list-main"><strong>{d.name}</strong><small>{series(d.letter)}. {d.last_push ? `Dernier envoi ${ago(d.last_push)}` : "Rien envoyé pour l’instant"}{d.pending ? `, ${d.pending} en attente` : ""}.</small></span>
      <span className="cx-list-actions"><button type="button" className="cx-text-btn cx-text-bad" onClick={() => setRevoke(d)}>Retirer</button></span>
    </div>)}{list && !active.length && <p className="cx-fold-note">Aucun ordinateur relié. Cliquez « Relier un ordinateur », puis tapez le code sur l’ordinateur du bureau.</p>}
      {list?.codes.map((c, i) => <div key={i} className="cx-list-row cx-static"><span className="cx-list-main"><strong>Code en attente</strong><small>{series(c.letter)}, valable jusqu’au {timeFr(c.expires_at)}.</small></span></div>)}</div>
    {code && (linked ? <Modal title="Ordinateur relié" subtitle={`« ${linked.name} » est prêt.`} onClose={() => setCode(null)} actions={<Button kind="primary" onClick={() => setCode(null)}>Terminé</Button>}>
      <p className="cx-linked"><Check size={20} aria-hidden="true" />« {linked.name} » a utilisé le code. Il émet la {series(linked.letter)}.</p>
      <p className="cx-muted">La personne se connecte maintenant sur cet ordinateur avec son identifiant et son mot de passe.</p>
    </Modal> : <Modal title="Code pour relier un ordinateur" subtitle="À taper sur l’ordinateur du bureau, une seule fois." onClose={() => setCode(null)} actions={<Button kind="primary" onClick={() => setCode(null)}>Fermer</Button>}>
      <p className="cx-big-code" translate="no">{code.code.slice(0, 3)} {code.code.slice(3)}</p>
      <p className="cx-wait-line" role="status"><span className="cx-dot-pulse" aria-hidden="true" />En attente de l’ordinateur… Cette fenêtre se met à jour toute seule.</p>
      <p className="cx-muted">Seul le code expire : s’il n’est pas tapé avant le {timeFr(code.expiresAt)}, créez-en un autre. Une fois relié, l’ordinateur le reste. Il émettra la {series(code.letter)}.</p>
    </Modal>)}
    {revoke && <Confirm title={`Retirer « ${revoke.name} » ?`} confirm="Retirer l’ordinateur" cancel="Garder" onClose={() => setRevoke(null)} onConfirm={async () => { try { await api("/api/devices/revoke", { id: revoke.id }); toast("Ordinateur retiré."); void load(); } catch (e) { toast((e as Error).message, "warn"); } setRevoke(null); }}>
      <p>Il ne pourra plus envoyer ni recevoir de données. Ce qu’il a déjà envoyé reste. Pour un ordinateur remplacé, reliez le nouveau : il reprendra la même série de numéros.</p>
      {revoke.pending > 0 && <Notice tone="warn">Il a encore {revoke.pending} modification(s) non envoyée(s). Si possible, laissez-le d’abord se connecter.</Notice>}</Confirm>}
  </section>;
}

// ——— The Direction's own connections to this site ———
type Session = { id: string; label: string; created_at: string; last_seen: string; current: boolean };
function Sessions() {
  const [list, setList] = useState<Session[] | null>(null), [error, setError] = useState(""), [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const load = () => api<{ sessions: Session[] }>("/api/sessions").then(r => { setList(r.sessions); setError(""); }).catch(e => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  const others = list?.filter(x => !x.current) ?? [];
  async function signOutOthers() {
    setBusy(true);
    try { const r = await api<{ signedOut: number }>("/api/sessions/others", {}); toast(r.signedOut ? `${r.signedOut} appareil(s) déconnecté(s).` : "Aucun autre appareil n’était connecté."); void load(); }
    catch (e) { toast((e as Error).message, "warn"); }
    finally { setBusy(false); setStep(0); }
  }
  return <section className="cx-section" aria-labelledby="set-sessions">
    <div className="cx-section-head cx-section-head-row"><div><h2 id="set-sessions">Vos connexions à ce site</h2><p>Chaque téléphone ou ordinateur où votre compte Direction est ouvert. Un appareil perdu ou prêté se déconnecte ici.</p></div>
      <Button disabled={!others.length} onClick={() => setStep(1)}>Déconnecter les autres appareils</Button></div>
    {error && <Notice tone="warn">{error}</Notice>}
    <div className="cx-panel cx-list">{list?.map(x => <div key={x.id} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{x.label}{x.current && <span className="cx-chip cx-tone-good">Cet appareil</span>}</strong><small>Connecté le {timeFr(x.created_at)}, utilisé {ago(x.last_seen)}.</small></span></div>)}</div>
    {step === 1 && <Confirm title={`Déconnecter ${others.length} autre(s) appareil(s) ?`} confirm="Continuer" cancel="Annuler" onClose={() => setStep(0)} onConfirm={() => setStep(2)}>
      <p>Ces appareils devront se reconnecter avec l’identifiant et le mot de passe de la Direction :</p>
      <ul className="cx-mini-list">{others.map(x => <li key={x.id}>{x.label}, utilisé {ago(x.last_seen)}</li>)}</ul>
      <p>Cet appareil-ci reste connecté. Les ordinateurs du bureau ne sont pas concernés (ils se retirent dans « Ordinateurs du bureau »).</p></Confirm>}
    {step === 2 && <Confirm title="Dernière confirmation" confirm={busy ? "Déconnexion…" : "Oui, déconnecter maintenant"} cancel="Annuler" onClose={() => setStep(0)} onConfirm={() => { if (!busy) void signOutOthers(); }}>
      <p>La déconnexion est immédiate. Si un appareil a été perdu ou volé, pensez aussi à changer le mot de passe de la Direction (« Nouveau mot de passe » ci-dessus).</p></Confirm>}
  </section>;
}

// ——— Règles et dérogations ———
export function LiftDialog({ title, effect, confirm, onClose, onConfirm }: { title: string; effect: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(""), [tried, setTried] = useState(false);
  return <Modal title={title} subtitle="Dérogation de la Direction" onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>Annuler</Button><Button kind="primary" onClick={() => { setTried(true); if (reason.trim().length >= 3) onConfirm(reason); }}>{confirm}</Button></>}>
    <p className="cx-lift-effect">{effect}</p>
    <Field label="Motif" required error={tried && reason.trim().length < 3 ? "Écrivez le motif en quelques mots." : undefined} hint="Il reste dans le journal, avec votre nom et la date."><TextArea rows={2} value={reason} onChange={setReason} placeholder="Ex. erreur de montant signalée par le client" /></Field>
    <p className="cx-muted">Vous pourrez revenir en arrière dans Réglages, Règles et dérogations.</p>
  </Modal>;
}
function Rules({ by }: { by: string }) {
  const d = useData(), [reopen, setReopen] = useState<string | null>(null), [undo, setUndo] = useState<Override | null>(null);
  const overrides = d.overrides ?? [];
  return <>
    <TermSettings by={by} />
    <section className="cx-section" aria-labelledby="set-months">
      <div className="cx-section-head"><h2 id="set-months">Mois clôturés</h2><p>La facturation clôture un mois quand il est terminé : plus de facture ni d’avoir dessus. Vous pouvez le rouvrir.</p></div>
      <div className="cx-panel cx-list">{[...d.closedMonths].sort().reverse().map(m => <div key={m} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{monthLabel(m)}</strong><small>Clôturé</small></span><span className="cx-list-actions"><button type="button" className="cx-text-btn" onClick={() => setReopen(m)}>Rouvrir</button></span></div>)}
        {!d.closedMonths.length && <p className="cx-fold-note">Aucun mois clôturé.</p>}</div>
    </section>
    <section className="cx-section" aria-labelledby="set-overrides">
      <div className="cx-section-head"><h2 id="set-overrides">Dérogations</h2><p>Chaque règle levée par la Direction, avec son motif. « Revenir en arrière » remet la règle comme avant.</p></div>
      {overrides.length ? <div className="cx-panel cx-list">{overrides.map(o => <div key={o.id} className={`cx-list-row cx-static${o.undoneAt ? " cx-cancelled" : ""}`}>
        <span className="cx-list-main"><strong>{o.label}</strong><small>{timeFr(o.at)} par {accountName(o.by)}. Motif : {o.reason}{o.undoneAt ? `. Annulée le ${timeFr(o.undoneAt)} par ${accountName(o.undoneBy)} : ${o.undoReason}` : ""}</small></span>
        <span className="cx-list-actions">{!o.undoneAt && ACTIONS[o.action] && <button type="button" className="cx-text-btn" onClick={() => setUndo(o)}>Revenir en arrière</button>}</span>
      </div>)}</div> : <div className="cx-card"><Empty title="Aucune dérogation pour l’instant.">Déverrouiller un paiement validé, rétablir un paiement annulé ou rouvrir un mois se fait depuis la page concernée ou ici.</Empty></div>}
    </section>
    {reopen && <LiftDialog title={`Rouvrir ${monthLabel(reopen)} ?`} effect={`La facturation pourra de nouveau créer et modifier des factures et des avoirs de ${monthLabel(reopen)}.`} confirm="Rouvrir le mois" onClose={() => setReopen(null)} onConfirm={r => { liftRule(by, "reopen-month", reopen, r); setReopen(null); toast(`${monthLabel(reopen)} rouvert.`); }} />}
    {undo && <LiftDialog title="Revenir en arrière ?" effect={`« ${undo.label} » sera annulé et la règle s’appliquera de nouveau.`} confirm="Revenir en arrière" onClose={() => setUndo(null)} onConfirm={r => { undoOverride(by, undo, r); setUndo(null); toast("Retour en arrière fait."); }} />}
  </>;
}

// ——— Données et sauvegarde ———
function ClientImport({ by }: { by: string }) {
  const [open, setOpen] = useState(false);
  return <section className="cx-section" aria-labelledby="set-import">
    <div className="cx-section-head cx-section-head-row"><div><h2 id="set-import">Importer des clients</h2><p>Votre liste de clients existante, depuis un fichier Excel (.xlsx) ou CSV : plus besoin de les saisir un par un. Ceux déjà enregistrés sont laissés tels quels.</p></div>
      <Button icon={<FileUp size={17} aria-hidden="true" />} onClick={() => setOpen(true)}>Importer un fichier</Button></div>
    {open && <ImportClients by={by} onClose={() => setOpen(false)} />}
  </section>;
}
function ExportAll() {
  const d = useData(), [busy, setBusy] = useState(false);
  return <section className="cx-section" aria-labelledby="set-export">
    <div className="cx-section-head cx-section-head-row"><div><h2 id="set-export">Exporter toutes les données</h2><p>Un seul fichier .zip à garder hors de Cloudflare (clé USB, disque, Google Drive) : une sauvegarde complète qui se recharge ici, et des tableaux qui s’ouvrent dans Excel ({d.invoices.length} factures, {d.payments.length} paiements, {d.clients.length} clients, le journal). Aucun mot de passe n’y figure.</p></div>
      <Button kind="primary" icon={<Download size={17} aria-hidden="true" />} disabled={busy} onClick={() => { setBusy(true); try { exportAll(); toast("Export complet téléchargé."); } catch { toast("L’export n’a pas pu être créé. Réessayez.", "warn"); } finally { setBusy(false); } }}>Tout exporter (.zip)</Button></div>
  </section>;
}
function SyncStatus() {
  const s = useSync(), devices = s.devices.filter(d => !d.revoked_at);
  return <section className="cx-section" aria-labelledby="set-sync">
    <div className="cx-section-head"><h2 id="set-sync">Envois des ordinateurs</h2><p>Ce que la Direction voit dépend du dernier envoi de chaque ordinateur.</p></div>
    <div className="cx-panel cx-list">
      <div className="cx-list-row cx-static"><span className="cx-list-main"><strong>Ce téléphone ou cet ordinateur</strong><small>{s.online ? `Données reçues ${s.lastPullAt ? ago(s.lastPullAt) : "—"}` : `Hors ligne, données du ${s.lastPullAt ? timeFr(s.lastPullAt) : "—"}`}{s.pending ? `. ${s.pending} action(s) en attente d’envoi` : ""}.</small></span></div>
      {devices.map(d => <div key={d.id} className="cx-list-row cx-static"><span className="cx-list-main"><strong>{d.name}</strong><small>{d.last_push ? `Dernier envoi ${ago(d.last_push)} (${timeFr(d.last_push)})` : "Rien envoyé pour l’instant"}{d.pending ? `, ${d.pending} modification(s) encore sur l’ordinateur` : ""}.</small></span></div>)}
    </div>
  </section>;
}
function DemoTools() {
  const d = useData(), [demo, setDemo] = useState(false);
  return <section className="cx-section" aria-labelledby="set-demo"><div className="cx-section-head"><h2 id="set-demo">Démonstration</h2><p>Ces boutons servent seulement à essayer la maquette.</p></div>
    <div className="cx-form-actions cx-left"><Button onClick={() => { setOnline(!d.officeOnline); toast(d.officeOnline ? "Coupure du bureau simulée." : "Bureau reconnecté."); }}>{d.officeOnline ? <><WifiOff size={16} aria-hidden="true" />Simuler une coupure du bureau</> : "Reconnecter le bureau"}</Button><Button kind="quiet" onClick={() => setDemo(true)}>Recharger les données d’exemple</Button></div>
    {demo && <Confirm title="Recharger les données d’exemple ?" confirm="Recharger" cancel="Garder mes essais" onClose={() => setDemo(false)} onConfirm={() => { resetDemo(); setDemo(false); toast("Données d’exemple rechargées."); }}><p>Les essais faits dans ce navigateur seront remplacés par les données de départ.</p></Confirm>}
  </section>;
}

// ——— Aide ———
const GUIDES: [string, string][] = [
  ["Valider", "Factures, en haut : cochez les nouvelles factures et les paiements contrôlés, puis « Valider ». Rien n’attend votre validation."],
  ["Lever une règle", "Un paiement validé à corriger : ouvrez le client, puis « Déverrouiller » sur le paiement. Un mois clôturé : Réglages, Règles et dérogations, « Rouvrir »."],
  ["Ajouter quelqu’un", "Réglages, Équipe et accès, « Ajouter une personne ». Remettez-lui la fiche avec son identifiant et son mot de passe."],
  ["Relier un ordinateur", "Réglages, Équipe et accès, « Relier un ordinateur ». Tapez le code à 6 chiffres sur l’ordinateur du bureau, dans les 24 heures."],
  ["Hors connexion", "Le bureau travaille sans internet et envoie tout au retour de la connexion. En haut de chaque page, la date des données affichées."],
  ["Mot de passe oublié", "Pour l’équipe : Réglages, Équipe et accès, « Nouveau mot de passe ». Pour la Direction : la personne qui a installé l’application dispose d’un lien de secours."],
];
function InstallHelp() {
  const { installed, ios, canPrompt, install } = useInstall();
  return <div className="cx-card cx-install-help">
    <h3>CAPSED comme une application</h3>
    {installed ? <p>CAPSED est installé sur cet appareil : ouvrez-le depuis son icône.</p> : <>
      <p>Une icône sur l’écran d’accueil : CAPSED s’ouvre directement, dans sa propre fenêtre, même avec peu de réseau.</p>
      {canPrompt ? <Button kind="primary" onClick={() => void install()}>Installer CAPSED</Button> : <ul>
        <li><b>Android (Chrome)</b> : menu <b>⋮</b> en haut à droite, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</li>
        <li><b>iPhone (Safari)</b> : bouton <b>Partager</b> en bas, puis « Sur l’écran d’accueil ».{ios ? "" : " Sur iPhone, utilisez Safari."}</li>
        <li><b>Ordinateur (Chrome ou Edge)</b> : l’icône d’installation à droite de la barre d’adresse.</li></ul>}
      <p className="cx-muted">Sur iPhone, l’application demande de se connecter une fois.</p>
    </>}
  </div>;
}
function Help() {
  const [manual, setManual] = useState(false);
  return <section className="cx-section">
    <div className="cx-section-head cx-section-head-row"><div><h2>Le manuel complet</h2><p>Chaque rôle pas à pas, avec des images, et que faire pour chaque message. À partager avec l’équipe : guide.capsed-facture.pages.dev</p></div>
      <Button kind="primary" icon={<BookOpen size={17} aria-hidden="true" />} onClick={() => CLOUD ? setManual(true) : window.open("https://guide.capsed-facture.pages.dev/", "_blank", "noopener")}>Ouvrir le manuel</Button></div>
    {MODE === "site" && <InstallHelp />}
    <ol className="cx-help">{GUIDES.map(([t, s], i) => <li key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{s}</p></div></li>)}</ol>
    {manual && <ManualOverlay src="guide/direction.html" onClose={() => setManual(false)} />}
  </section>;
}
