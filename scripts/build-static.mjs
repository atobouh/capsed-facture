import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import postcss from "postcss";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
// demo: the GitHub Pages demo (dist). site: the Direction website served by the cloud Worker (dist-site).
// office: the desktop app for Facturation and Encaissement (dist-office), linked to CAPSED_API.
const mode = process.argv[2] ?? "demo";
if (!["demo", "site", "office"].includes(mode)) throw new Error("Mode inconnu : " + mode);
// The office build can also be published under /bureau/ of the cloud site (CAPSED_OUT=dist-site/bureau, CAPSED_API=""),
// an installable offline web app until the Windows installer is ready.
const api = process.env.CAPSED_API ?? "https://capsed.erdj5926.workers.dev";
const dist = path.join(root, process.env.CAPSED_OUT ?? (mode === "demo" ? "dist" : `dist-${mode}`));
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [path.join(root, "static-src", mode === "demo" ? "main.tsx" : "cloud.tsx")],
  define: { __CAPSED_MODE__: JSON.stringify(mode), __CAPSED_API__: JSON.stringify(mode === "office" ? api : "") },
  outfile: path.join(dist, "app.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  alias: { "@": root },
  logLevel: "info",
});
const baseCss = (await readFile(path.join(root, "app", "globals.css"), "utf8"))
  .replace(/^@import [^\n]+\n/gm, "");
const modalCss = `
[data-slot="dialog-overlay"],[data-slot="alert-dialog-overlay"]{position:fixed;inset:0;z-index:50;background:#071e2ca8}
[data-slot="dialog-content"],[data-slot="alert-dialog-content"]{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:51;width:min(96vw,650px);max-height:90vh;overflow-y:auto;background:#fff;border:1px solid #dce8ee;border-radius:14px;padding:26px;box-shadow:0 20px 60px #102b3d38;display:grid;gap:17px}
[data-slot="dialog-content"]>button[data-slot="dialog-close"]{position:absolute;right:16px;top:16px;border:0;background:transparent;color:#7d95a3}
[data-slot="dialog-title"],[data-slot="alert-dialog-title"]{font-size:21px;font-weight:700;color:#173449}
[data-slot="dialog-description"],[data-slot="alert-dialog-description"]{font-size:13px;line-height:1.5;color:#79909d}
[data-slot="alert-dialog-footer"]{display:flex;justify-content:flex-end;gap:10px}
[data-slot="alert-dialog-cancel"],[data-slot="alert-dialog-action"]{min-height:42px;border-radius:8px;padding:10px 15px;font-size:14px;font-weight:700}
[data-slot="alert-dialog-cancel"]{background:#fff;color:#39657b;border:1px solid #cbdfe9}
[data-slot="alert-dialog-action"]{background:#1576ad;color:#fff;border:1px solid #1576ad}
`;
const editorialCss = await readFile(path.join(root, "app", "editorial.css"), "utf8");
const simpleCss = await readFile(path.join(root, "app", "simple.css"), "utf8");
const formatCreditCss = await readFile(path.join(root, "app", "format-credit.css"), "utf8");
const polishCss = await readFile(path.join(root, "app", "polish.css"), "utf8");
const desktopCss = await readFile(path.join(root, "app", "desktop.css"), "utf8");
const controlCss = await readFile(path.join(root, "app", "control-center.css"), "utf8");
// The first prototype's CSS styles whole pages (and locks html/body scrolling on wide screens). It ships
// separately and only loads at #ancien. The new app keeps just the rules that draw the A4 documents.
const legacyCss = baseCss + modalCss + editorialCss + simpleCss + formatCreditCss + polishCss + desktopCss + controlCss + await readFile(path.join(root, "app", "feedback.css"), "utf8");
if (mode === "demo") await writeFile(path.join(dist, "legacy.css"), legacyCss);
const paperCss = postcss.parse(legacyCss);
paperCss.walkRules(rule => { if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return; const keep = rule.selectors.filter(sel => /\.(doc-|document-|free-table|kind-|credit-items|credit-motif|field-note|receipt-|statement-)/.test(sel) && !/\b(html|body|#root)\b/.test(sel)); if (!keep.length) rule.remove(); else rule.selectors = keep; });
paperCss.walkAtRules(at => { if (at.name !== "font-face" && !at.nodes?.length) at.remove(); });
paperCss.walkAtRules(at => { if (at.name === "media" && !at.nodes?.some(n => n.type === "rule" || n.type === "atrule")) at.remove(); });
await writeFile(path.join(dist, "styles.css"), paperCss.toString() + "\n" + await readFile(path.join(root, "app", "v2", "fonts.css"), "utf8") + await readFile(path.join(root, "app", "v2", "v2.css"), "utf8"));
const assetVersion = createHash("sha256").update(await readFile(path.join(dist, "app.js"))).update(await readFile(path.join(dist, "styles.css"))).digest("hex").slice(0, 12);
// Shown from the very first frame until the app has started: no blank window, even on a slow computer.
const bootCss = "html,body{margin:0;background:#F6F5F7;color:#1B1820}.cx-boot{position:fixed;inset:0;display:grid;place-content:center;justify-items:center;gap:18px;font:500 15px/1.4 Geist,system-ui,-apple-system,'Segoe UI',sans-serif;opacity:0;animation:cx-boot-in .35s ease .2s forwards}.cx-boot img{width:72px;height:72px;border-radius:17px;box-shadow:0 10px 30px #3a24432e}.cx-boot strong{display:block;font-size:20px;font-weight:600;letter-spacing:.02em;text-align:center}.cx-boot small{display:block;color:#6F6878;font-size:13px;text-align:center;margin-top:2px}.cx-boot i{display:block;width:132px;height:3px;border-radius:3px;background:#EADFEC;overflow:hidden;position:relative}.cx-boot i::after{content:'';position:absolute;inset:0 auto 0 0;width:40%;border-radius:3px;background:#5E3A6B;animation:cx-boot-bar 1.1s ease-in-out infinite}@keyframes cx-boot-in{to{opacity:1}}@keyframes cx-boot-bar{from{transform:translateX(-100%)}to{transform:translateX(250%)}}@media (prefers-reduced-motion:reduce){.cx-boot{animation:none;opacity:1}.cx-boot i::after{animation:none;width:100%}}";
const bootHtml = `<div class="cx-boot" role="status" aria-label="Ouverture de CAPSED"><img src="favicon.svg" alt=""><div><strong>CAPSED</strong><small>${mode === "site" ? "Direction" : mode === "office" ? "Bureau · Facturation et encaissement" : "Facture"}</small></div><i></i></div>`;
await writeFile(path.join(dist, "index.html"), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F6F5F7"><meta name="description" content="CAPSED : facturation, encaissement et contrôle des clients, un espace par rôle.">${mode !== "demo" ? `<meta name="robots" content="noindex"><link rel="manifest" href="manifest.webmanifest">` : ""}<title>${mode === "site" ? "CAPSED Direction" : mode === "office" ? "CAPSED Bureau" : "CAPSED Facture"}</title><link rel="preload" href="fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="favicon.svg"><link rel="apple-touch-icon" href="capsed-apple-180.png">${mode !== "demo" ? `<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="CAPSED"><meta name="apple-mobile-web-app-status-bar-style" content="default">` : ""}<style>${bootCss}</style><link rel="stylesheet" href="styles.css?v=${assetVersion}"></head><body><div id="root">${bootHtml}</div><script type="module" src="app.js?v=${assetVersion}"></script></body></html>`);
await copyFile(path.join(root, "public", "favicon.svg"), path.join(dist, "favicon.svg"));


await copyFile(path.join(root, "public", "capsed-letterhead.webp"), path.join(dist, "capsed-letterhead.webp"));
await copyFile(path.join(root, "public", "capsed-logo.png"), path.join(dist, "capsed-logo.png"));
for (const f of ["capsed-app-192.png", "capsed-app-512.png", "capsed-apple-180.png", "capsed-maskable-192.png", "capsed-maskable-512.png"]) await copyFile(path.join(root, "public", f), path.join(dist, f));
await copyFile(path.join(root, "public", "capsed-header.webp"), path.join(dist, "capsed-header.webp"));
await mkdir(path.join(dist, "fonts"), { recursive: true });
for (const f of await readdir(path.join(root, "public", "fonts"))) await copyFile(path.join(root, "public", "fonts", f), path.join(dist, "fonts", f));

if (mode !== "demo") await copyFile(path.join(root, "static-src", "sw.js"), path.join(dist, "sw.js"));
// The desktop app shows this small card the moment it is clicked, while the main window gets ready.
if (mode === "office") await copyFile(path.join(root, "static-src", "splash.html"), path.join(dist, "splash.html"));
// The open site checks this small file to offer the new version as soon as it is published.
if (mode !== "demo") await writeFile(path.join(dist, "version.json"), JSON.stringify({ v: assetVersion }));
// Installable on a phone or a computer, like an app: an icon on the home screen, its own window, no address bar.
if (mode !== "demo") await writeFile(path.join(dist, "manifest.webmanifest"), JSON.stringify({
  id: "./", name: mode === "site" ? "CAPSED Direction" : "CAPSED Bureau", short_name: "CAPSED",
  description: mode === "site" ? "Le suivi des clients, des factures et de l’équipe, pour la Direction." : "Facturation et encaissement, même sans internet.",
  start_url: "./", scope: "./", display: "standalone", orientation: "any", background_color: "#F6F5F7", theme_color: "#5E3A6B", lang: "fr", dir: "ltr", categories: ["business", "finance"],
  icons: [
    { src: "capsed-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "capsed-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "capsed-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "capsed-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
  ],
}));
// app.js and styles.css are always asked for with ?v=<their hash>, and the fonts never change: kept a year on the phone.
// Only the site root's _headers counts (the office copy under /bureau/ has none of its own).
if (mode !== "demo" && !process.env.CAPSED_OUT) await writeFile(path.join(dist, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: SAMEORIGIN\n  Content-Security-Policy: frame-ancestors 'self'\n" + ["/app.js", "/styles.css", "/fonts/*", "/bureau/app.js", "/bureau/styles.css", "/bureau/fonts/*"].map(p => `${p}\n  Cache-Control: public, max-age=31536000, immutable\n`).join(""));
