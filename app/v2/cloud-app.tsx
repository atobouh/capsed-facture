/** The two real applications around the same screens:
 *  - the Direction website (online, data from the cloud, kept on the phone for bad connections);
 *  - the office desktop app (works offline, linked to the cloud with a code from the Direction). */
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button, Field, Notice, ToastHost } from "./ui";
import { HOME, HelpPanel, OfficeShell, SignInBrand, SiteShell } from "./app";
import { OfficeScreen } from "./office";
import type { OfficeRoute } from "./clients";
import { ResponsableScreen } from "./responsable";
import type { RRoute } from "./responsable";
import { DIRECTION_LETTER } from "./collections";
import { checkPassword } from "./password";
import { ROLE_LABEL, commit, forgetLocalData, getData, nowIso, receives, setSeriesLetter, useData } from "./store";
import type { Account } from "./store";
import { resetSync, startSync, syncNow, useSync } from "./sync";
import { fetchJson } from "./net";
import type { NetOptions } from "./net";

declare const __CAPSED_API__: string | undefined;
// The desktop app has the server address built in; served from the cloud itself (/bureau/), it uses that address.
const DEFAULT_API = (typeof __CAPSED_API__ === "string" && __CAPSED_API__) || (typeof location !== "undefined" && location.protocol.startsWith("http") ? location.origin : "");
const read = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const write = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* rien */ } };

function call<T>(base: string, path: string, body?: unknown, opts?: NetOptions): Promise<T> {
  return fetchJson<T>(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-capsed": "1" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: base ? "omit" : "same-origin" }, opts);
}
/** Button text while waiting: says so when the connection is slow, so nobody thinks it froze. */
const waiting = (busy: boolean, slow: boolean, label: string, doing: string) => !busy ? label : slow ? "Connexion lente, on continue…" : doing;

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return <div className="cx-password"><input id={id} className="cx-input" type={show ? "text" : "password"} value={value} autoComplete={autoComplete} onChange={e => onChange(e.target.value)} /><button type="button" className="cx-icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>;
}
function Screen({ children }: { children: React.ReactNode }) {
  return <div className="cx-app"><main className="cx-signin"><SignInBrand /><section className="cx-signin-panel">{children}</section></main><ToastHost /></div>;
}
function Loading({ title, detail, error, onRetry }: { title: string; detail?: string; error?: string; onRetry?: () => void }) {
  return <Screen><div className="cx-signin-form" role="status"><h2>{title}</h2>{detail && <p className="cx-muted">{detail}</p>}{error && <Notice tone="warn">{error}</Notice>}{onRetry && <Button icon={<RefreshCw size={16} aria-hidden="true" />} onClick={onRetry}>Réessayer</Button>}</div></Screen>;
}

// ——— New version published: offered on screen, applied with one click ———
const RUNNING = (() => { try { return new URL(import.meta.url).searchParams.get("v") ?? ""; } catch { return ""; } })();
function useNewVersion() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // The desktop app carries its own files; it is updated by installing the new version.
    if (!RUNNING || "__TAURI_INTERNALS__" in window) return;
    const look = () => { if (document.visibilityState === "visible") fetch("version.json", { cache: "no-store" }).then(r => (r.ok ? r.json() : null) as Promise<{ v?: string } | null>).then(j => { if (j?.v && j.v !== RUNNING) setReady(true); }).catch(() => { /* hors ligne */ }); };
    const t = setInterval(look, 5 * 60_000), first = setTimeout(look, 20_000);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(t); clearTimeout(first); document.removeEventListener("visibilitychange", look); };
  }, []);
  return ready;
}
function UpdateBar() {
  const ready = useNewVersion();
  if (!ready) return null;
  return <div className="cx-update-bar" role="status"><span>Une nouvelle version est prête.</span><Button kind="primary" onClick={() => location.reload()}>Mettre à jour</Button></div>;
}

// ——— Direction website ———
const ME = "capsed-site-me";
export function CloudSiteApp() {
  const [me, setMe] = useState<Account | null>(() => { try { return JSON.parse(read(ME)) as Account; } catch { return null; } });
  const [phase, setPhase] = useState<"check" | "setup" | "login" | "ready">(me ? "ready" : "check"), [netError, setNetError] = useState("");
  const sync = useSync(), d = useData();
  const [route, setRoute] = useState<OfficeRoute>({ name: "clients" }), [help, setHelp] = useState(false);
  const nav = useCallback((r: OfficeRoute) => { setRoute(r); window.scrollTo(0, 0); }, []);

  const check = useCallback(async () => {
    try { const r = await call<{ account: Account }>("", "/api/me", undefined, { tries: 3, timeout: 20_000 }); setMe(r.account); write(ME, JSON.stringify(r.account)); setPhase("ready"); }
    catch (e) {
      if ((e as { status?: number }).status === 401) { try { setPhase((await call<{ needed: boolean }>("", "/api/setup", undefined, { tries: 3, timeout: 20_000 })).needed ? "setup" : "login"); } catch (x) { setNetError((x as Error).message); } }
      else if (me) setPhase("ready"); // offline: keep working with the copy on this phone
      else setNetError((e as Error).message);
    }
  }, [me]);
  useEffect(() => { void Promise.resolve().then(check); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== "ready" || !me) return;
    setSeriesLetter(DIRECTION_LETTER);
    startSync({ api: "", by: () => me.id, interval: 12_000 });
    document.title = "CAPSED, Direction";
  }, [phase, me]);

  function signedIn(a: Account) { write(ME, JSON.stringify(a)); setMe(a); setPhase("ready"); syncNow(); }
  async function signOut() {
    try { await call("", "/api/logout", {}); } catch { /* hors ligne : la session expirera */ }
    resetSync(); forgetLocalData(); write(ME, ""); setMe(null); setPhase("login");
  }

  if (phase === "check") return <Loading title="Connexion au serveur…" error={netError} onRetry={netError ? () => { setNetError(""); void check(); } : undefined} />;
  if (phase === "setup") return <Screen><DirectionSetup onDone={signedIn} /></Screen>;
  // An expired session (seen by the sync) asks to sign in again; the data on this phone is kept.
  if (phase === "login" || !me || sync.authLost) return <Screen><DirectionLogin onDone={signedIn} expired={!!me} /></Screen>;
  if (!sync.firstPullDone && !d.invoices.length && !d.accounts.length) return <Loading title="Chargement des données du bureau…" detail={sync.received ? `${sync.received} éléments reçus` : "Cela prend quelques secondes, même sur une connexion lente."} error={sync.error} onRetry={sync.error ? syncNow : undefined} />;
  const account = d.accounts.find(a => a.id === me.id) ?? me;
  return <div className="cx-app cx-role-responsable">
    <SiteShell me={account} route={route} nav={nav} onHelp={() => setHelp(true)} onSignOut={signOut}><ResponsableScreen route={route as RRoute} nav={nav as (r: RRoute) => void} by={me.id} /></SiteShell>
    {help && <HelpPanel role="responsable" route={route.name} onClose={() => setHelp(false)} />}
    <UpdateBar />
    <ToastHost />
  </div>;
}

function DirectionLogin({ onDone, expired }: { onDone: (a: Account) => void; expired: boolean }) {
  const [login, setLogin] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [slow, setSlow] = useState(false);
  async function submit() {
    if (!login.trim() || !password) return setError("Saisissez votre identifiant et votre mot de passe.");
    setBusy(true);
    try { onDone((await call<{ account: Account }>("", "/api/login", { login, password }, { tries: 3, timeout: 30_000, onSlow: setSlow })).account); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="cx-signin-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <h2>Connexion de la Direction</h2>
    <p className="cx-muted">{expired ? "Votre connexion a expiré. Reconnectez-vous ; vos données sont gardées." : "Ce site est réservé à la Direction. L’équipe travaille dans l’application de bureau."}</p>
    <Field label="Identifiant"><input id="login" className="cx-input" value={login} autoFocus autoComplete="username" onChange={e => { setLogin(e.target.value); setError(""); }} /></Field>
    <Field label="Mot de passe"><PasswordInput id="password" value={password} onChange={v => { setPassword(v); setError(""); }} autoComplete="current-password" /></Field>
    {error && <Notice tone="bad">{error}</Notice>}
    <Button kind="primary" type="submit" wide disabled={busy}>{waiting(busy, slow, "Se connecter", "Connexion…")}</Button>
  </form>;
}

function DirectionSetup({ onDone }: { onDone: (a: Account) => void }) {
  const [name, setName] = useState(""), [login, setLogin] = useState(""), [password, setPassword] = useState(""), [again, setAgain] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [slow, setSlow] = useState(false);
  async function submit() {
    if (!name.trim() || !login.trim()) return setError("Écrivez le nom et l’identifiant.");
    if (password.length < 6) return setError("Le mot de passe doit avoir au moins 6 caractères.");
    if (password !== again) return setError("Les deux mots de passe sont différents.");
    setBusy(true);
    try { onDone((await call<{ account: Account }>("", "/api/setup", { name, login, password }, { timeout: 45_000, onSlow: setSlow })).account); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="cx-signin-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <h2>Créer le compte de la Direction</h2>
    <p className="cx-muted">Première ouverture du site. Ce compte crée ensuite les accès de l’équipe et relie les ordinateurs du bureau.</p>
    <Field label="Nom"><input id="name" className="cx-input" value={name} autoFocus onChange={e => { setName(e.target.value); setError(""); }} placeholder="Ex. La Direction" /></Field>
    <Field label="Identifiant" hint="Lettres et chiffres, sans espace."><input id="login" className="cx-input" value={login} autoComplete="username" onChange={e => { setLogin(e.target.value.toLowerCase()); setError(""); }} placeholder="Ex. direction" /></Field>
    <Field label="Mot de passe"><PasswordInput id="password" value={password} onChange={v => { setPassword(v); setError(""); }} autoComplete="new-password" /></Field>
    <Field label="Le même mot de passe"><PasswordInput id="again" value={again} onChange={v => { setAgain(v); setError(""); }} autoComplete="new-password" /></Field>
    {error && <Notice tone="bad">{error}</Notice>}
    <Button kind="primary" type="submit" wide disabled={busy}>{waiting(busy, slow, "Créer le compte", "Création…")}</Button>
  </form>;
}

// ——— Office desktop app ———
const DEVICE = "capsed-office-device", SESSION = "capsed-office-session";
type Device = { api: string; id: string; name: string; letter: string; token: string };
const readDevice = (): Device | null => { try { return JSON.parse(read(DEVICE)) as Device; } catch { return null; } };

export function OfficeApp() {
  const [device, setDevice] = useState<Device | null>(readDevice);
  useEffect(() => {
    if (!device) return;
    setSeriesLetter(device.letter);
    startSync({ api: device.api, token: device.token, by: () => read(SESSION) || undefined, interval: 20_000 });
  }, [device]);
  if (!device) return <Screen><Enroll onDone={d => { write(DEVICE, JSON.stringify(d)); setDevice(d); }} /></Screen>;
  return <OfficeSignedIn device={device} onUnlink={() => { resetSync(); forgetLocalData(); write(DEVICE, ""); write(SESSION, ""); setDevice(null); }} />;
}

function OfficeSignedIn({ device, onUnlink }: { device: Device; onUnlink: () => void }) {
  const d = useData(), sync = useSync(), [sid, setSid] = useState(() => read(SESSION));
  const me = d.accounts.find(a => a.id === sid && a.active && a.role !== "responsable");
  const [route, setRoute] = useState<OfficeRoute>(() => HOME[me?.role ?? "facturation"]), [help, setHelp] = useState(false);
  const nav = useCallback((r: OfficeRoute) => { setRoute(r); document.getElementById("contenu")?.scrollTo(0, 0); }, []);
  // Requests from the Direction are marked as received on this computer.
  useEffect(() => {
    if (!me) return;
    const fresh = d.requests.filter(r => receives(me.role, r.to) && !r.receivedAt);
    if (fresh.length) commit(me.id, x => ({ requests: x.requests.map(r => fresh.some(f => f.id === r.id) ? { ...r, receivedAt: nowIso() } : r) }));
  }, [d.requests, me]);
  useEffect(() => { document.title = me ? `CAPSED, ${ROLE_LABEL[me.role]}` : "CAPSED, Connexion"; }, [me]);
  if (!sync.firstPullDone && !d.accounts.length) return <Loading title="Première récupération des données…" detail={sync.received ? `${sync.received} éléments reçus` : `Poste « ${device.name} ». Une seule fois, ensuite le poste travaille même sans internet.`} error={sync.authLost ? "Ce poste n’est plus autorisé. Demandez un nouveau code à la Direction." : sync.error} onRetry={sync.authLost ? onUnlink : sync.error ? syncNow : undefined} />;
  if (!me) return <Screen><OfficeLogin device={device} authLost={!!sync.authLost} onUnlink={onUnlink} onDone={a => { write(SESSION, a.id); setSid(a.id); setRoute(HOME[a.role]); }} /></Screen>;
  return <div className={`cx-app cx-role-${me.role}`}>
    <OfficeShell me={me} route={route} nav={nav} onHelp={() => setHelp(true)} onSignOut={() => { write(SESSION, ""); setSid(""); }}><OfficeScreen role={me.role} by={me.id} route={route} nav={nav} /></OfficeShell>
    {help && <HelpPanel role={me.role} route={route.name} onClose={() => setHelp(false)} />}
    <UpdateBar />
    <ToastHost />
  </div>;
}

function Enroll({ onDone }: { onDone: (d: Device) => void }) {
  const [code, setCode] = useState(""), [name, setName] = useState(""), [api, setApi] = useState(DEFAULT_API), [advanced, setAdvanced] = useState(!DEFAULT_API), [error, setError] = useState(""), [busy, setBusy] = useState(false), [slow, setSlow] = useState(false);
  // Same id for every try from this screen: if the cloud accepted the code but the reply was lost, trying again gets this computer back.
  const [attempt] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""));
  async function submit() {
    if (code.replace(/\D/g, "").length !== 6) return setError("Le code a 6 chiffres. La Direction le crée dans Réglages, Équipe et accès.");
    if (!name.trim()) return setError("Donnez un nom à cet ordinateur, par exemple « Facturation 1 ».");
    const base = api.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) return setError("Adresse du serveur invalide.");
    setBusy(true);
    try { const r = await call<{ device: Omit<Device, "api" | "token">; token: string }>(base, "/api/devices/enroll", { code, name, attempt }, { tries: 4, timeout: 30_000, onSlow: setSlow }); onDone({ ...r.device, api: base, token: r.token }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="cx-signin-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <h2>Relier cet ordinateur</h2>
    <p className="cx-muted">Une seule fois. Ensuite il travaille même sans internet et envoie tout dès que la connexion revient.</p>
    <Field label="Code du poste" hint="6 chiffres, donnés par la Direction (valable 24 heures)."><input id="code" className="cx-input cx-code-input" inputMode="numeric" autoComplete="one-time-code" value={code} autoFocus onChange={e => { setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7)); setError(""); }} placeholder="123 456" /></Field>
    <Field label="Nom de cet ordinateur"><input id="device-name" className="cx-input" value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Ex. Facturation 1" /></Field>
    {advanced ? <Field label="Adresse du serveur"><input id="api" className="cx-input" value={api} onChange={e => { setApi(e.target.value); setError(""); }} placeholder="https://capsed.exemple.workers.dev" /></Field>
      : <button type="button" className="cx-link-btn" onClick={() => setAdvanced(true)}>Changer l’adresse du serveur</button>}
    {error && <Notice tone="bad">{error}</Notice>}
    <Button kind="primary" type="submit" wide disabled={busy}>{waiting(busy, slow, "Relier l’ordinateur", "Connexion…")}</Button>
  </form>;
}

function OfficeLogin({ device, authLost, onDone, onUnlink }: { device: Device; authLost: boolean; onDone: (a: Account) => void; onUnlink: () => void }) {
  const [login, setLogin] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const team = getData().accounts.filter(a => a.role !== "responsable");
  async function submit() {
    if (!login.trim() || !password) return setError("Saisissez votre identifiant et votre mot de passe.");
    const a = getData().accounts.find(x => x.login.toLowerCase() === login.trim().toLowerCase());
    setBusy(true);
    const ok = !!a && await checkPassword(password, a);
    setBusy(false);
    if (!a || !ok) return setError("Identifiant ou mot de passe incorrect. Vérifiez la fiche remise par la Direction.");
    if (!a.active) return setError("Ce compte est désactivé. Adressez-vous à la Direction.");
    if (a.role === "responsable") return setError("La Direction utilise le site, pas l’application de bureau.");
    onDone(a);
  }
  return <form className="cx-signin-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <h2>Connexion</h2>
    <p className="cx-muted">Poste « {device.name} »{device.letter ? `, factures de la série ${device.letter}` : ""}. Fonctionne aussi sans internet.</p>
    {authLost && <Notice tone="bad" title="Ce poste n’est plus relié">La Direction l’a retiré. <button type="button" className="cx-link-btn" onClick={onUnlink}>Relier avec un nouveau code</button></Notice>}
    {!team.length && <Notice>Aucun compte de l’équipe pour l’instant. La Direction les crée dans Réglages, Équipe et accès.</Notice>}
    <Field label="Identifiant"><input id="login" className="cx-input" value={login} autoFocus autoComplete="username" onChange={e => { setLogin(e.target.value); setError(""); }} /></Field>
    <Field label="Mot de passe"><PasswordInput id="password" value={password} onChange={v => { setPassword(v); setError(""); }} autoComplete="current-password" /></Field>
    {error && <Notice tone="bad">{error}</Notice>}
    <Button kind="primary" type="submit" wide disabled={busy}>Se connecter</Button>
  </form>;
}
