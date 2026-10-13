/** Installing the site like an app: an icon on the home screen, its own window, no address bar.
 *  Android (and Chrome or Edge on a computer) offer their own install window, kept here for the « Installer » buttons;
 *  on iPhone it is done from Safari's Share menu, so the screens explain it. */
import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  // Android (and computers with Chrome or Edge) offer their own install window; it is kept for the « Installer » button.
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e as InstallPrompt; installListeners.forEach(l => l()); });
  window.addEventListener("appinstalled", () => { installPrompt = null; installListeners.forEach(l => l()); });
}
const isInstalled = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1));
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick(n => n + 1); installListeners.add(l); return () => { installListeners.delete(l); }; }, []);
  return { installed: isInstalled(), ios: isIOS(), canPrompt: !!installPrompt, install: async () => { if (!installPrompt) return false; await installPrompt.prompt(); const r = await installPrompt.userChoice; installPrompt = null; installListeners.forEach(l => l()); return r.outcome === "accepted"; } };
}
