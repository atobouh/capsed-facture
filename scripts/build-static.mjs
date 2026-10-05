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
await writeFile(path.join(dist, "index.html"), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#F6F5F7"><meta name="description" content="CAPSED : facturation, encaissement et contrôle des clients, un espace par rôle.">${mode !== "demo" ? `<meta name="robots" content="noindex"><link rel="manifest" href="manifest.webmanifest">` : ""}<title>${mode === "site" ? "CAPSED Direction" : mode === "office" ? "CAPSED Bureau" : "CAPSED Facture"}</title><link rel="preload" href="fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="styles.css?v=${assetVersion}"></head><body><div id="root"></div><script type="module" src="app.js?v=${assetVersion}"></script></body></html>`);
await copyFile(path.join(root, "public", "favicon.svg"), path.join(dist, "favicon.svg"));


await copyFile(path.join(root, "public", "capsed-letterhead.webp"), path.join(dist, "capsed-letterhead.webp"));
await copyFile(path.join(root, "public", "capsed-logo.png"), path.join(dist, "capsed-logo.png"));
await copyFile(path.join(root, "public", "capsed-header.webp"), path.join(dist, "capsed-header.webp"));
await mkdir(path.join(dist, "fonts"), { recursive: true });
for (const f of await readdir(path.join(root, "public", "fonts"))) await copyFile(path.join(root, "public", "fonts", f), path.join(dist, "fonts", f));

if (mode !== "demo") await copyFile(path.join(root, "static-src", "sw.js"), path.join(dist, "sw.js"));
if (mode !== "demo") await writeFile(path.join(dist, "manifest.webmanifest"), JSON.stringify({ name: mode === "site" ? "CAPSED Direction" : "CAPSED Bureau", short_name: "CAPSED", start_url: "./", display: "standalone", background_color: "#F6F5F7", theme_color: "#5E3A6B", lang: "fr", icons: [{ src: "capsed-logo.png", sizes: "192x192", type: "image/png" }] }));
if (mode !== "demo") await writeFile(path.join(dist, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: DENY\n");
