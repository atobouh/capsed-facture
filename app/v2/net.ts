/** Calls to the cloud that cope with a very slow or unstable connection:
 *  each try has a time limit, a lost try is tried again, and the screen is told when it is slow
 *  so it can say so instead of looking frozen. */
export type NetOptions = { timeout?: number; tries?: number; onSlow?: (slow: boolean) => void };
export class HttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }

const SLOW_AFTER = 5_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function fetchJson<T>(url: string, init: RequestInit, { timeout = 30_000, tries = 1, onSlow }: NetOptions = {}): Promise<T> {
  const slow = onSlow ? setTimeout(() => onSlow(true), SLOW_AFTER) : null;
  try {
    for (let n = 1; ; n++) {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
        const body = await r.json().catch(() => ({})) as { error?: string };
        // A gateway hiccup is worth another try; a refusal from the server is not.
        if (r.status >= 502 && r.status <= 504 && n < tries) { await sleep(1500 * n); continue; }
        if (!r.ok) throw new HttpError(body.error ?? `Le serveur a répondu ${r.status}.`, r.status);
        return body as T;
      } catch (e) {
        if (e instanceof HttpError) throw e;
        if (n < tries) { await sleep(1500 * n); continue; }
        throw new Error(ctl.signal.aborted ? "La connexion est très lente et le serveur n’a pas répondu à temps. Réessayez : rien n’est perdu." : "Pas de connexion au serveur. Vérifiez internet puis réessayez.");
      } finally { clearTimeout(t); }
    }
  } finally { if (slow) clearTimeout(slow); onSlow?.(false); }
}
