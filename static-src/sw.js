// CAPSED: keeps the Direction site (or the office app under /bureau/) on the device so it opens without network,
// with the data saved at the last visit. Data always comes from /api (never cached here).
const CACHE = "capsed-v1-" + self.registration.scope;
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./styles.css", "./app.js", "./fonts/Geist-Variable.woff2", "./capsed-logo.png", "./favicon.svg"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function remember(req, res) {
  if (!res.ok || res.type === "opaque") return res;
  const c = await caches.open(CACHE), url = new URL(req.url);
  // One copy per file: a new version replaces the old one.
  for (const k of await c.keys()) if (new URL(k.url).pathname === url.pathname && k.url !== req.url) await c.delete(k);
  await c.put(req, res.clone());
  return res;
}
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/secours/")) return;
  // The Direction site's worker leaves the office app (/bureau/) to its own worker.
  if (new URL(self.registration.scope).pathname === "/" && url.pathname.startsWith("/bureau/")) return;
  if (req.mode === "navigate") {
    // Network first (fresh version), the saved page after 4 seconds or without network.
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(self.registration.scope).then(r => { if (!done && r) { done = true; resolve(r); } });
      const t = setTimeout(fallback, 4000);
      fetch(req).then(res => { clearTimeout(t); remember(new Request(self.registration.scope), res.clone()); if (!done) { done = true; resolve(res); } }).catch(() => { clearTimeout(t); caches.match(self.registration.scope).then(r => { if (!done) { done = true; resolve(r ?? Response.error()); } }); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => remember(req, res)).catch(() => hit ?? Response.error());
    return hit ?? net;
  }));
});
