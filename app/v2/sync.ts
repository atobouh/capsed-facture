/** Sync with the cloud, built for a bad network.
 *  Every change made in the app becomes a small record in an outbox kept on this computer or phone.
 *  The outbox is sent in batches (compressed); a send cut halfway is simply sent again, the cloud ignores what it already has.
 *  Then the changes made elsewhere are fetched from a cursor, so only what is new travels. */
import { useSyncExternalStore } from "react";
import { DATA_KEY, LIST_COLLECTIONS, SETTINGS_FIELDS, keyOf } from "./collections";
import type { CollectionName } from "./collections";
import { MODE, applyRemote, nowIso, setCommitHook, setReceivedAt, uid } from "./store";
import type { Data } from "./store";

type Rec = Record<string, unknown>;
export type Change = { changeId: string; collection: CollectionName; id: string; data: Rec; base: number; at: string; by: string };
export type DeviceStatus = { id: string; name: string; letter: string; last_push: string | null; last_pull: string | null; pending: number; revoked_at: string | null; created_at: string };
export type SyncState = {
  online: boolean; busy: boolean; pending: number; firstPullDone: boolean;
  lastOkAt?: string; lastPullAt?: string; lastPushAt?: string; offlineSince?: string;
  error?: string; authLost?: boolean; rejected: { at: string; text: string }[]; devices: DeviceStatus[]; received?: number;
};
export type SyncConfig = { api: string; token?: string; by: () => string | undefined; interval?: number };

const P = `capsed-${MODE}-sync-`;
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* stockage plein */ } };

let outbox: Change[] = read("outbox", []), revs: Record<string, number> = read("revs", {}), cursor: number = read("cursor", 0);
let state: SyncState = { ...read<Partial<SyncState>>("state", {}), online: typeof navigator === "undefined" || navigator.onLine, busy: false, pending: outbox.length, rejected: read("rejected", []), devices: read("devices", []), firstPullDone: read("firstPullDone", false) } as SyncState;
let config: SyncConfig | null = null, timer: ReturnType<typeof setTimeout> | null = null, running = false, again = false, backoff = 0;
const listeners = new Set<() => void>();

function set(p: Partial<SyncState>) {
  state = { ...state, ...p, pending: outbox.length };
  const { busy: _b, online: _o, ...keep } = state; void _b; void _o;
  write("state", { lastOkAt: keep.lastOkAt, lastPullAt: keep.lastPullAt, lastPushAt: keep.lastPushAt, offlineSince: keep.offlineSince });
  listeners.forEach(l => l());
}
export const getSync = () => state;
export function useSync() { return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getSync, getSync); }
const k = (c: string, id: string) => c + ":" + id;
const persist = () => { write("outbox", outbox); write("revs", revs); write("cursor", cursor); };

/** When did the office's data last reach the cloud? (what the Direction is looking at) */
export function officeFreshness(devices = state.devices) {
  const pushes = devices.filter(d => !d.revoked_at && d.last_push).map(d => d.last_push!).sort();
  return pushes.at(-1) ?? "";
}
setReceivedAt(() => officeFreshness());

// ——— What changed in the app ———
const clean = (v: unknown) => JSON.parse(JSON.stringify(v)) as Rec;
function diff(prev: Data, next: Data, by: string): Change[] {
  const out: Change[] = [], at = nowIso();
  const mk = (collection: CollectionName, id: string, data: unknown): Change => ({ changeId: uid(), collection, id, data: clean(data), base: revs[k(collection, id)] ?? 0, at, by });
  for (const c of LIST_COLLECTIONS) {
    const key = DATA_KEY[c] as keyof Data, a = (prev[key] ?? []) as Rec[], b = (next[key] ?? []) as Rec[];
    if (a === b) continue;
    const old = new Map(a.map(r => [keyOf(c, r), r]));
    for (const r of b) { const id = keyOf(c, r), o = old.get(id); if (o === r || (o && JSON.stringify(o) === JSON.stringify(r))) continue; out.push(mk(c, id, r)); }
  }
  if (SETTINGS_FIELDS.some(f => prev[f] !== next[f] && JSON.stringify(prev[f]) !== JSON.stringify(next[f])))
    out.push(mk("settings", "main", { id: "main", ...Object.fromEntries(SETTINGS_FIELDS.map(f => [f, next[f]])) }));
  return out;
}
let inFlight = new Set<string>();
function record(changes: Change[]) {
  if (!changes.length) return;
  for (const ch of changes) {
    // Two edits of the same record before it was sent travel as one, from the version the cloud had.
    const i = outbox.findIndex(o => o.collection === ch.collection && o.id === ch.id && !inFlight.has(o.changeId));
    if (i >= 0) outbox[i] = { ...ch, base: outbox[i].base }; else outbox.push(ch);
  }
  persist(); set({}); schedule(1500);
}

// ——— Talking to the cloud ———
class AuthError extends Error {}
class SlowError extends Error {}
// Pages and batches follow the connection: smaller after a try that timed out, bigger again when it is quick.
let pageSize = 200, batchSize = 50;
async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "x-capsed": "1" };
  if (config?.token) headers.authorization = "Bearer " + config.token;
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    const text = JSON.stringify(body);
    if (text.length > 1024 && typeof CompressionStream !== "undefined") { payload = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob(); headers["content-encoding"] = "gzip"; }
    else payload = text;
  }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), method === "GET" ? 45_000 : 60_000);
  try {
    const r = await fetch((config?.api ?? "") + path, { method, headers, body: payload, signal: ctl.signal, credentials: config?.token ? "omit" : "same-origin", cache: "no-store" });
    if (r.status === 401) throw new AuthError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Connexion expirée.");
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Le serveur a répondu ${r.status}.`);
    return await r.json() as T;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (ctl.signal.aborted) throw new SlowError("Connexion très lente : on continue par petits morceaux, rien n’est perdu.");
    throw new Error(ctl.signal.aborted ? "Le réseau est trop lent, nouvel essai bientôt." : e instanceof TypeError ? "Pas de connexion au serveur." : (e as Error).message);
  } finally { clearTimeout(t); }
}

const LABEL: Record<string, string> = { clients: "Client", invoices: "Facture", payments: "Paiement", credits: "Avoir", deliveries: "Remise", requests: "Demande", events: "Journal", accounts: "Compte", overrides: "Dérogation", settings: "Réglages" };
type PushResult = { changeId: string; ok: boolean; rev?: number; record?: Rec | null; error?: string };
async function push() {
  while (outbox.length) {
    const batch = outbox.slice(0, batchSize);
    inFlight = new Set(batch.map(c => c.changeId));
    const started = Date.now();
    let res: { results: PushResult[] };
    try { res = await request<{ results: PushResult[] }>("POST", "/api/sync", { changes: batch, pending: outbox.length - batch.length }); }
    catch (e) { inFlight = new Set(); if (e instanceof SlowError) batchSize = Math.max(5, batchSize >> 1); throw e; }
    if (Date.now() - started < 4_000) batchSize = Math.min(50, batchSize * 2);
    const remote: { collection: string; id: string; data: Rec | null }[] = [], rejected: SyncState["rejected"] = [];
    for (const r of res.results) {
      const ch = batch.find(c => c.changeId === r.changeId); if (!ch) continue;
      outbox = outbox.filter(o => o.changeId !== r.changeId);
      if (r.ok && r.rev) {
        const old = revs[k(ch.collection, ch.id)] ?? 0;
        revs[k(ch.collection, ch.id)] = r.rev;
        outbox = outbox.map(o => o.collection === ch.collection && o.id === ch.id && o.base === old ? { ...o, base: r.rev! } : o);
      }
      if (!r.ok) rejected.push({ at: nowIso(), text: `${LABEL[ch.collection] ?? ch.collection} : ${r.error}` });
      // The cloud's answer is the truth (merged with changes made elsewhere, or the refused change undone).
      const pendingSame = outbox.some(o => o.collection === ch.collection && o.id === ch.id);
      if (!pendingSame && r.record !== undefined && JSON.stringify(r.record) !== JSON.stringify(ch.data)) remote.push({ collection: ch.collection, id: ch.id, data: r.record });
    }
    inFlight = new Set();
    persist();
    applyRemote(remote);
    if (rejected.length) { const all = [...rejected, ...state.rejected].slice(0, 20); write("rejected", all); set({ rejected: all }); }
    set({ lastPushAt: nowIso() });
  }
}
async function pull() {
  let received = 0;
  for (;;) {
    const started = Date.now();
    let res: { records: { collection: string; id: string; rev: number; data: Rec }[]; cursor: number; more: boolean; devices: DeviceStatus[] };
    try { res = await request("GET", `/api/sync?since=${cursor}&limit=${pageSize}`); }
    catch (e) { if (e instanceof SlowError) pageSize = Math.max(25, pageSize >> 1); throw e; }
    if (Date.now() - started < 4_000) pageSize = Math.min(500, pageSize * 2);
    // A record still waiting in the outbox stays as typed here; sending it will merge it with the cloud's version.
    const take = res.records.filter(r => !outbox.some(o => o.collection === r.collection && o.id === r.id));
    for (const r of res.records) revs[k(r.collection, r.id)] = r.rev;
    cursor = res.cursor; received += res.records.length;
    persist();
    applyRemote(take);
    write("devices", res.devices);
    set({ devices: res.devices, received });
    if (!res.more) break;
  }
  write("firstPullDone", true);
  set({ lastPullAt: nowIso(), firstPullDone: true });
}

async function cycle() {
  if (!config) return;
  if (running) { again = true; return; }
  running = true; again = false;
  if (timer) { clearTimeout(timer); timer = null; }
  // Quick refresh while someone is looking; slower when the window is in the background.
  let delay = typeof document !== "undefined" && document.visibilityState === "hidden" ? 120_000 : config.interval ?? 30_000;
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Pas de connexion internet.");
    set({ busy: true });
    await push();
    await pull();
    backoff = 0;
    set({ busy: false, online: true, error: undefined, authLost: false, lastOkAt: nowIso(), offlineSince: undefined });
  } catch (e) {
    // A slow link keeps going right away with smaller pieces; a cut link is retried within a minute at most.
    backoff = e instanceof SlowError ? 2_000 : Math.min(backoff ? backoff * 2 : 5_000, 60_000); delay = backoff;
    const slow = e instanceof SlowError; // slow is not offline: the next piece leaves in 2 seconds
    set({ busy: false, online: slow, error: (e as Error).message, authLost: e instanceof AuthError, offlineSince: slow ? state.offlineSince : state.offlineSince ?? nowIso() });
    if (e instanceof AuthError) delay = 300_000;
  } finally {
    running = false;
    if (again) delay = 500;
    schedule(delay);
  }
}
function schedule(ms: number) {
  if (!config) return;
  if (running) { again = true; return; }
  if (timer) clearTimeout(timer);
  timer = setTimeout(cycle, ms);
}

export function startSync(cfg: SyncConfig) {
  config = cfg;
  setCommitHook((prev, next, by) => record(diff(prev, next, cfg.by() ?? by)));
  if (typeof window !== "undefined") {
    window.addEventListener("online", syncNow);
    window.addEventListener("offline", () => set({ online: false, offlineSince: state.offlineSince ?? nowIso() }));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  }
  void cycle();
}
export function syncNow() { backoff = 0; void cycle(); }
export function stopSync() { config = null; if (timer) clearTimeout(timer); timer = null; setCommitHook(null); set({ authLost: false, busy: false }); }
/** Forget everything kept for sync on this browser (sign-out on a shared phone). */
export function resetSync() {
  stopSync();
  for (const key of ["outbox", "revs", "cursor", "state", "rejected", "devices", "firstPullDone"]) { try { localStorage.removeItem(P + key); } catch { /* rien */ } }
  outbox = []; revs = {}; cursor = 0; state = { online: true, busy: false, pending: 0, rejected: [], devices: [], firstPullDone: false };
  listeners.forEach(l => l());
}
export function dismissRejected() { write("rejected", []); set({ rejected: [] }); }
export { request as cloudRequest };
export const outboxFor = (collection: string, id: string) => outbox.some(o => o.collection === collection && o.id === id);
export const isPending = () => outbox.length > 0;

