/** CAPSED Bureau (desktop) only: is a new version available, and has it been put off with « Plus tard »?
 *  The Rust side (src-tauri/src/update.rs) only reads latest.json; nothing is downloaded until « Installer ». */
import { useEffect, useSyncExternalStore } from "react";

export type DesktopUpdate = { version: string; notes?: string | null; failedBefore?: boolean };
type TauriBridge = { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
export const tauri = () => (window as unknown as { __TAURI_INTERNALS__?: TauriBridge }).__TAURI_INTERNALS__;

// « Plus tard » hides the notice for that version for 3 days; a newer version shows again at once.
const LATER = "capsed-update-later", LATER_FOR = 3 * 864e5;
const laterOf = (): { v: string; t: number } | null => { try { return JSON.parse(localStorage.getItem(LATER) ?? "null"); } catch { return null; } };

let available: DesktopUpdate | null = null;
let snapshot: { available: DesktopUpdate | null; putOff: boolean } = { available, putOff: false };
const listeners = new Set<() => void>();
function refresh() {
  const l = laterOf();
  snapshot = { available, putOff: !!available && !!l && l.v === available.version && Date.now() - l.t < LATER_FOR };
  listeners.forEach(f => f());
}
export function putOff() { if (available) { try { localStorage.setItem(LATER, JSON.stringify({ v: available.version, t: Date.now() })); } catch { /* rien */ } } refresh(); }
export function showAgain() { try { localStorage.removeItem(LATER); } catch { /* rien */ } refresh(); }

let polling = false;
function poll() {
  const t = tauri(); if (!t || polling) return; polling = true;
  const look = () => t.invoke<DesktopUpdate | null>("update_ready").then(r => {
    if ((r?.version ?? "") !== (available?.version ?? "") || r?.failedBefore !== available?.failedBefore) { available = r ?? null; refresh(); }
  }).catch(() => { /* ancienne version */ });
  setTimeout(look, 12_000); setInterval(look, 60_000);
}
export function useDesktopUpdate() {
  useEffect(poll, []);
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => snapshot);
}
