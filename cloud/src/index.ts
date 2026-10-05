/** CAPSED cloud: the Direction site, its sign-in, the office computers' sync and the full history.
 *  Workers + D1. Records travel as small JSON; nothing is ever deleted (every version is kept). */
import { afterMerge, merge, refuse, same } from "./rules";
import type { Role } from "./rules";
import { COLLECTIONS, DEVICE_LETTERS } from "../../app/v2/collections";
import type { CollectionName } from "../../app/v2/collections";
import { checkPassword, makeHash, sameString } from "../../app/v2/password";

interface Env { DB: D1Database; ASSETS: Fetcher; RECOVERY_KEY?: string }
type Rec = Record<string, unknown>;
type Account = { id: string; name: string; role: Role; login: string; active: boolean; email?: string; visiblePassword?: string; pwHash?: string; pwSalt?: string; pwIter?: number; password?: string; passwordAt?: string; createdAt?: string };
type Actor = { account: Account; device: { id: string; name: string; letter: string } | null };
type Change = { changeId: string; collection: CollectionName; id: string; data: Rec; base?: number; at?: string; by?: string };

const COOKIE = "capsed_s", SESSION_DAYS = 30, MAX_BATCH = 100, MAX_PULL = 500;
const now = () => new Date().toISOString();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const uuid = () => crypto.randomUUID();

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
const fail = (status: number, error: string, headers: Record<string, string> = {}) => json({ error }, status, headers);

/** Office computers call from the desktop app (another origin); they use a bearer token, never cookies. */
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return origin ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, content-type, content-encoding, x-capsed", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "86400", vary: "origin" } : {};
}

async function readJson<T>(req: Request): Promise<T> {
  let body: ReadableStream | null = req.body;
  if (body && req.headers.get("content-encoding") === "gzip") body = body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(body).text();
  if (text.length > 4_000_000) throw new HttpError(413, "Envoi trop volumineux.");
  try { return JSON.parse(text) as T; } catch { throw new HttpError(400, "Données illisibles."); }
}
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

// ——— Records ———
/** The Direction can read each person's password again (their choice); office computers only ever get the hash. */
const forDevice = (collection: string, data: Rec | null | undefined) => {
  if (!data || collection !== "accounts" || !("visiblePassword" in data)) return data;
  const { visiblePassword: _v, ...rest } = data; void _v; return rest;
};
const publicAccount = (a: Account) => ({ id: a.id, name: a.name, role: a.role, login: a.login, active: a.active });
async function getRecord(env: Env, collection: string, id: string) {
  const row = await env.DB.prepare("SELECT data, rev FROM records WHERE collection = ? AND id = ?").bind(collection, id).first<{ data: string; rev: number }>();
  return row ? { data: JSON.parse(row.data) as Rec, rev: row.rev } : null;
}
async function writeRecord(env: Env, v: { collection: string; id: string; data: Rec; by: string | null; device: string | null; clientAt?: string; changeId?: string; note?: string }) {
  const changeId = v.changeId ?? uuid(), at = now(), data = JSON.stringify(v.data);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO versions (change_id, collection, id, data, client_at, received_at, by, device, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(changeId, v.collection, v.id, data, v.clientAt ?? null, at, v.by, v.device, v.note ?? null),
    env.DB.prepare(`INSERT INTO records (collection, id, data, rev, updated_at, updated_by, device) VALUES (?, ?, ?, (SELECT seq FROM versions WHERE change_id = ?), ?, ?, ?)
      ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at, updated_by = excluded.updated_by, device = excluded.device`).bind(v.collection, v.id, data, changeId, at, v.by, v.device),
  ]);
  const row = await env.DB.prepare("SELECT seq FROM versions WHERE change_id = ?").bind(changeId).first<{ seq: number }>();
  return row!.seq;
}
async function accountByLogin(env: Env, login: string) {
  const row = await env.DB.prepare("SELECT data FROM records WHERE collection = 'accounts' AND lower(json_extract(data, '$.login')) = lower(?)").bind(login.trim()).first<{ data: string }>();
  return row ? JSON.parse(row.data) as Account : null;
}
async function accountById(env: Env, id: string) { return (await getRecord(env, "accounts", id))?.data as Account | undefined; }
async function event(env: Env, by: string, text: string, extra: Rec = {}) {
  const id = uuid();
  await writeRecord(env, { collection: "events", id, data: { id, at: now(), by, text, ...extra }, by, device: null });
}

// ——— Sign-in ———
async function tooManyFailures(env: Env, key: string, max: number) {
  const row = await env.DB.prepare("SELECT count(*) AS n FROM login_failures WHERE key = ? AND at > ?").bind(key, later(-15 * 60_000)).first<{ n: number }>();
  return (row?.n ?? 0) >= max;
}
const noteFailure = (env: Env, key: string) => env.DB.prepare("INSERT INTO login_failures (key, at) VALUES (?, ?)").bind(key, now()).run();
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? "local";
/** « Android · Chrome », « Windows · Edge »…: enough for the Direction to recognise its own phones and computers. */
function deviceLabel(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navigateur";
  return `${os} · ${browser}`;
}
async function startSession(env: Env, account: Account, req?: Request) {
  const token = newToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, account_id, created_at, last_seen, expires_at, label) VALUES (?, ?, ?, ?, ?, ?)").bind(await sha256(token), account.id, now(), now(), later(SESSION_DAYS * 864e5), deviceLabel(req?.headers.get("user-agent") ?? "")).run();
  return { "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` };
}
const clearCookie = { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` };
function cookieToken(req: Request) { return (req.headers.get("cookie") ?? "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) || null; }

/** The Direction on the website (cookie), or an office computer (bearer token) acting for the person signed in on it. */
async function webActor(env: Env, req: Request): Promise<Actor | null> {
  const token = cookieToken(req); if (!token) return null;
  const hash = await sha256(token);
  const s = await env.DB.prepare("SELECT account_id, expires_at, last_seen FROM sessions WHERE token_hash = ?").bind(hash).first<{ account_id: string; expires_at: string; last_seen: string }>();
  if (!s || s.expires_at < now()) return null;
  // When each connection was last used (written at most every 5 minutes).
  if (Date.parse(s.last_seen) < Date.now() - 5 * 60_000) await env.DB.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").bind(now(), hash).run();
  const account = await accountById(env, s.account_id);
  if (!account?.active || account.role !== "responsable") return null;
  return { account, device: null };
}
async function deviceOf(env: Env, req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return env.DB.prepare("SELECT id, name, letter FROM devices WHERE token_hash = ? AND revoked_at IS NULL").bind(await sha256(auth.slice(7))).first<{ id: string; name: string; letter: string }>();
}

// ——— Sync ———
async function applyChange(env: Env, who: Actor | { device: { id: string; name: string; letter: string } }, ch: Change) {
  if (typeof ch?.changeId !== "string" || ch.changeId.length < 8 || ch.changeId.length > 80) return { changeId: String(ch?.changeId), ok: false, error: "Modification sans identifiant." };
  if (!COLLECTIONS.includes(ch.collection) || typeof ch.id !== "string" || !ch.id || ch.id.length > 160 || !ch.data || typeof ch.data !== "object" || Array.isArray(ch.data)) return { changeId: ch.changeId, ok: false, error: "Modification mal formée." };
  if (JSON.stringify(ch.data).length > 200_000) return { changeId: ch.changeId, ok: false, error: "Enregistrement trop volumineux." };
  const done = await env.DB.prepare("SELECT seq FROM versions WHERE change_id = ?").bind(ch.changeId).first<{ seq: number }>();
  const cur = await getRecord(env, ch.collection, ch.id);
  // Already received (a send cut by the network and sent again): answer the same, change nothing.
  if (done) return { changeId: ch.changeId, ok: true, rev: cur?.rev ?? done.seq, record: cur?.data ?? ch.data, duplicate: true };
  // On an office computer the person signed in there acts; the computer can never act as the Direction.
  let account: Account | undefined, device: string | null = null;
  if ("account" in who) account = who.account;
  else {
    device = who.device.id;
    account = ch.by ? await accountById(env, ch.by) : undefined;
    if (!account?.active || account.role === "responsable") return { changeId: ch.changeId, ok: false, error: "Personne inconnue ou désactivée sur ce poste." };
  }
  if (ch.collection === "events" && cur) return { changeId: ch.changeId, ok: true, rev: cur.rev, record: cur.data };
  const data: Rec = { ...ch.data };
  if (ch.collection === "accounts") delete data.password;
  let base: Rec | null = null;
  if (cur && ch.base) base = ch.base === cur.rev ? cur.data : JSON.parse((await env.DB.prepare("SELECT data FROM versions WHERE collection = ? AND id = ? AND seq <= ? ORDER BY seq DESC LIMIT 1").bind(ch.collection, ch.id, ch.base).first<{ data: string }>())?.data ?? "null");
  const at = now(), merged = afterMerge(ch.collection, account.role, cur?.data ?? null, merge(base, cur?.data ?? null, data), at);
  const reason = refuse(ch.collection, account.role, account.id, cur?.data ?? null, merged);
  if (reason) return { changeId: ch.changeId, ok: false, error: reason, rev: cur?.rev ?? 0, record: cur?.data ?? null };
  if (cur && same(cur.data, merged)) return { changeId: ch.changeId, ok: true, rev: cur.rev, record: cur.data };
  // An invoice made or changed by the office in a month already closed (a computer that was offline when it was closed):
  // kept, nothing is lost, and marked for the Direction.
  let final = merged;
  if (ch.collection === "invoices" && account.role !== "responsable") {
    const closed = ((await getRecord(env, "settings", "main"))?.data?.closedMonths as string[] | undefined) ?? [];
    if (closed.includes(String(merged.date ?? "").slice(0, 7))) final = { ...merged, afterClose: at };
  }
  const rev = await writeRecord(env, { collection: ch.collection, id: ch.id, data: final, by: account.id, device, clientAt: ch.at, changeId: ch.changeId });
  return { changeId: ch.changeId, ok: true, rev, record: final };
}

async function devicesStatus(env: Env) {
  const { results } = await env.DB.prepare("SELECT id, name, letter, last_push, last_pull, pending, revoked_at, created_at FROM devices ORDER BY created_at").all();
  return results;
}

// ——— Recovery link (only the developer knows it): set a new Direction password. ———
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CAPSED, secours</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#F6F5F7;color:#1B1820;margin:0;padding:24px}main{max-width:420px;margin:8vh auto;background:#fff;border:1px solid #E7E4EA;border-radius:12px;padding:24px}h1{font-size:20px;margin:0 0 6px}label{display:grid;gap:4px;margin:14px 0;font-weight:500}input,select{font:inherit;padding:10px;border:1px solid #D9D4DE;border-radius:8px}button{font:inherit;font-weight:500;width:100%;padding:12px;border:0;border-radius:8px;background:#5E3A6B;color:#fff}p{color:#6F6878}a{color:#5E3A6B}</style></head><body><main>${body}</main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function recovery(env: Env, req: Request, key: string) {
  if (await tooManyFailures(env, "secours:" + ipOf(req), 20)) return page("<h1>Trop d’essais</h1><p>Réessayez dans 15 minutes.</p>", 429);
  if (!env.RECOVERY_KEY || env.RECOVERY_KEY.length < 24 || !sameString(key, env.RECOVERY_KEY)) { await noteFailure(env, "secours:" + ipOf(req)); return new Response("Not found", { status: 404 }); }
  const { results } = await env.DB.prepare("SELECT data FROM records WHERE collection = 'accounts' AND json_extract(data, '$.role') = 'responsable'").all<{ data: string }>();
  const heads = results.map(r => JSON.parse(r.data) as Account);
  if (req.method === "POST") {
    const form = await req.formData(), id = String(form.get("account") ?? ""), password = String(form.get("password") ?? "");
    const a = heads.find(x => x.id === id);
    if (!a || password.length < 6) return page(`<h1>Mot de passe non changé</h1><p>Choisissez un compte et un mot de passe d’au moins 6 caractères.</p><p><a href="">Recommencer</a></p>`, 400);
    await writeRecord(env, { collection: "accounts", id: a.id, data: { ...a, ...(await makeHash(password)), visiblePassword: password, active: true, passwordAt: now() }, by: null, device: null, note: "lien de secours" });
    await env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(a.id).run();
    await event(env, a.id, `Mot de passe de ${a.name} réinitialisé par le lien de secours`);
    return page(`<h1>C’est fait</h1><p>${esc(a.name)} peut se connecter avec l’identifiant <strong>${esc(a.login)}</strong> et le nouveau mot de passe.</p><p><a href="/">Ouvrir le site</a></p>`);
  }
  if (!heads.length) return page(`<h1>Aucun compte Direction</h1><p>Ouvrez le site pour créer le premier compte.</p><p><a href="/">Ouvrir le site</a></p>`);
  return page(`<h1>Nouveau mot de passe Direction</h1><p>Ce lien sert uniquement si la Direction a oublié son mot de passe.</p><form method="post"><label>Compte<select name="account">${heads.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.login)})</option>`).join("")}</select></label><label>Nouveau mot de passe<input name="password" type="text" minlength="6" required autocomplete="new-password"></label><button type="submit">Enregistrer</button></form>`);
}

// ——— Router ———
async function api(env: Env, req: Request, url: URL): Promise<Response> {
  const p = url.pathname, post = req.method === "POST";
  // Cookie-based calls must come from the site itself (a custom header cannot be sent cross-site).
  const csrf = () => { if (post && req.headers.get("x-capsed") !== "1") throw new HttpError(403, "Requête refusée."); };

  if (p === "/api/setup") {
    const any = await env.DB.prepare("SELECT 1 FROM records WHERE collection = 'accounts' LIMIT 1").first();
    if (!post) return json({ needed: !any });
    csrf();
    if (any) return fail(409, "Le compte Direction existe déjà.");
    const b = await readJson<{ name?: string; login?: string; password?: string }>(req);
    const name = b.name?.trim() ?? "", login = b.login?.trim().toLowerCase() ?? "";
    if (!name || !/^[a-z0-9._-]{2,40}$/.test(login) || (b.password ?? "").length < 6) return fail(400, "Nom, identifiant (lettres et chiffres) et mot de passe d’au moins 6 caractères.");
    const a: Account = { id: uuid(), name, role: "responsable", login, active: true, createdAt: now(), passwordAt: now(), ...(await makeHash(b.password!)), visiblePassword: b.password };
    await writeRecord(env, { collection: "accounts", id: a.id, data: a, by: a.id, device: null, note: "premier compte" });
    await event(env, a.id, `Compte Direction créé pour ${a.name}`);
    return json({ account: publicAccount(a) }, 200, await startSession(env, a, req));
  }
  if (p === "/api/login" && post) {
    csrf();
    const b = await readJson<{ login?: string; password?: string }>(req), login = (b.login ?? "").trim().toLowerCase();
    if (await tooManyFailures(env, "login:" + login, 10) || await tooManyFailures(env, "ip:" + ipOf(req), 30)) return fail(429, "Trop d’essais. Réessayez dans 15 minutes.");
    const a = login ? await accountByLogin(env, login) : null;
    if (!a || !(await checkPassword(b.password ?? "", a))) { await noteFailure(env, "login:" + login); await noteFailure(env, "ip:" + ipOf(req)); return fail(401, "Identifiant ou mot de passe incorrect."); }
    if (!a.active) return fail(403, "Ce compte est désactivé.");
    if (a.role !== "responsable") return fail(403, "Ce site est réservé à la Direction. L’équipe travaille dans l’application de bureau.");
    return json({ account: publicAccount(a) }, 200, await startSession(env, a, req));
  }
  if (p === "/api/logout" && post) {
    const token = cookieToken(req);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, clearCookie);
  }
  if (p === "/api/me") { const w = await webActor(env, req); return w ? json({ account: publicAccount(w.account) }) : fail(401, "Connectez-vous."); }

  // Office computers: enrolment with a one-time code from the Direction.
  if (p === "/api/devices/enroll" && post) {
    if (await tooManyFailures(env, "enroll:" + ipOf(req), 10)) return fail(429, "Trop d’essais. Réessayez dans 15 minutes.", cors(req));
    const b = await readJson<{ code?: string; name?: string; attempt?: string }>(req), code = (b.code ?? "").replace(/\D/g, ""), name = (b.name ?? "").trim().slice(0, 60);
    const attempt = /^[a-z0-9-]{16,64}$/i.test(b.attempt ?? "") ? await sha256(b.attempt!) : null, codeHash = code.length === 6 ? await sha256(code) : "";
    // The same computer retrying after a lost reply: same code, same attempt id, within the code's validity.
    if (attempt && codeHash) {
      const again = await env.DB.prepare("SELECT d.id, d.name, d.letter FROM device_codes c JOIN devices d ON d.id = c.device_id WHERE c.code_hash = ? AND c.attempt_hash = ? AND c.expires_at > ? AND d.revoked_at IS NULL").bind(codeHash, attempt, now()).first<{ id: string; name: string; letter: string }>();
      if (again) {
        const token = newToken();
        await env.DB.prepare("UPDATE devices SET token_hash = ? WHERE id = ?").bind(await sha256(token), again.id).run();
        return json({ device: again, token }, 200, cors(req));
      }
    }
    const row = codeHash ? await env.DB.prepare("SELECT letter, created_by FROM device_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?").bind(codeHash, now()).first<{ letter: string; created_by: string }>() : null;
    if (!row || !name) { await noteFailure(env, "enroll:" + ipOf(req)); return fail(400, "Code inconnu ou expiré. Demandez un nouveau code à la Direction.", cors(req)); }
    const id = uuid(), token = newToken();
    await env.DB.batch([
      env.DB.prepare("UPDATE device_codes SET used_at = ?, attempt_hash = ?, device_id = ? WHERE code_hash = ?").bind(now(), attempt, id, codeHash),
      env.DB.prepare("INSERT INTO devices (id, name, letter, token_hash, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind(id, name, row.letter, await sha256(token), now(), row.created_by),
    ]);
    await event(env, row.created_by, `Poste « ${name} » ajouté${row.letter ? `, série ${row.letter}` : ", série principale"}`);
    return json({ device: { id, name, letter: row.letter }, token }, 200, cors(req));
  }

  if (p === "/api/sync") {
    const web = await webActor(env, req), device = web ? null : await deviceOf(env, req);
    const h = web ? {} : cors(req);
    if (!web && !device) return fail(401, web === null && req.headers.get("authorization") ? "Ce poste n’est plus autorisé. Demandez un nouveau code à la Direction." : "Connectez-vous.", h);
    if (post) {
      if (web) csrf();
      const b = await readJson<{ changes?: Change[]; pending?: number }>(req), changes = (b.changes ?? []).slice(0, MAX_BATCH);
      const results = [];
      for (const ch of changes) { const r = await applyChange(env, web ?? { device: device! }, ch); results.push(device && "record" in r ? { ...r, record: forDevice(ch.collection, r.record as Rec | null) } : r); }
      if (device) await env.DB.prepare("UPDATE devices SET last_push = ?, pending = ? WHERE id = ?").bind(now(), Math.max(0, Number(b.pending) || 0), device.id).run();
      return json({ results, serverTime: now() }, 200, h);
    }
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0), limit = Math.min(MAX_PULL, Math.max(1, Number(url.searchParams.get("limit")) || MAX_PULL));
    const { results } = await env.DB.prepare("SELECT collection, id, data, rev FROM records WHERE rev > ? ORDER BY rev LIMIT ?").bind(since, limit + 1).all<{ collection: string; id: string; data: string; rev: number }>();
    const rows = results.slice(0, limit);
    if (device) await env.DB.prepare("UPDATE devices SET last_pull = ? WHERE id = ?").bind(now(), device.id).run();
    return json({ records: rows.map(r => ({ collection: r.collection, id: r.id, rev: r.rev, data: device ? forDevice(r.collection, JSON.parse(r.data)) : JSON.parse(r.data) })), cursor: rows.at(-1)?.rev ?? since, more: results.length > limit, devices: await devicesStatus(env), serverTime: now(), device: device ?? undefined }, 200, h);
  }

  // Direction only below.
  const w = await webActor(env, req);
  if (!w) return fail(401, "Connectez-vous.");
  if (p === "/api/devices" && !post) {
    const { results: codes } = await env.DB.prepare("SELECT letter, created_at, expires_at FROM device_codes WHERE used_at IS NULL AND expires_at > ?").bind(now()).all();
    return json({ devices: await devicesStatus(env), codes });
  }
  if (p === "/api/devices/code" && post) {
    csrf();
    const b = await readJson<{ letter?: string }>(req);
    const { results: used } = await env.DB.prepare("SELECT letter FROM devices WHERE revoked_at IS NULL UNION SELECT letter FROM device_codes WHERE used_at IS NULL AND expires_at > ?").bind(now()).all<{ letter: string }>();
    const taken = new Set(used.map(u => u.letter)), letter = b.letter !== undefined ? b.letter : DEVICE_LETTERS.find(l => !taken.has(l));
    if (letter === undefined || !DEVICE_LETTERS.includes(letter) || taken.has(letter)) return fail(400, "Toutes les séries de numéros sont utilisées. Retirez d’abord un poste.");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0"), expiresAt = later(24 * 36e5);
    await env.DB.prepare("INSERT INTO device_codes (code_hash, letter, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(await sha256(code), letter, w.account.id, now(), expiresAt).run();
    return json({ code, letter, expiresAt });
  }
  // The Direction's own sign-ins: list them, and sign out every other phone or computer at once.
  if (p === "/api/sessions" && !post) {
    const mine = await sha256(cookieToken(req)!);
    const { results } = await env.DB.prepare("SELECT token_hash, label, created_at, last_seen FROM sessions WHERE account_id = ? AND expires_at > ? ORDER BY last_seen DESC").bind(w.account.id, now()).all<{ token_hash: string; label: string | null; created_at: string; last_seen: string }>();
    return json({ sessions: results.map(r => ({ id: r.token_hash.slice(0, 12), label: r.label ?? "Appareil", created_at: r.created_at, last_seen: r.last_seen, current: r.token_hash === mine })) });
  }
  if (p === "/api/sessions/others" && post) {
    csrf();
    const mine = await sha256(cookieToken(req)!);
    const r = await env.DB.prepare("DELETE FROM sessions WHERE account_id = ? AND token_hash != ?").bind(w.account.id, mine).run();
    const n = r.meta.changes ?? 0;
    await event(env, w.account.id, `${w.account.name} a déconnecté ${n} autre(s) appareil(s) du site`);
    return json({ signedOut: n });
  }
  if (p === "/api/devices/revoke" && post) {
    csrf();
    const b = await readJson<{ id?: string }>(req);
    const d = await env.DB.prepare("SELECT name FROM devices WHERE id = ? AND revoked_at IS NULL").bind(b.id ?? "").first<{ name: string }>();
    if (!d) return fail(404, "Poste introuvable.");
    await env.DB.prepare("UPDATE devices SET revoked_at = ? WHERE id = ?").bind(now(), b.id).run();
    await event(env, w.account.id, `Poste « ${d.name} » retiré`);
    return json({ ok: true });
  }
  return fail(404, "Adresse inconnue.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
        return await api(env, req, url);
      }
      const m = url.pathname.match(/^\/secours\/([A-Za-z0-9_-]+)\/?$/);
      if (m) return await recovery(env, req, m[1]);
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, cors(req));
      console.error(e);
      return fail(500, "Erreur du serveur. Réessayez dans un instant.", cors(req));
    }
  },
} satisfies ExportedHandler<Env>;
