import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [path.join(root, "static-src", "main.tsx")],
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
await writeFile(path.join(dist, "styles.css"), baseCss + modalCss + editorialCss + simpleCss + formatCreditCss + polishCss + desktopCss + controlCss + await readFile(path.join(root, "app", "feedback.css"), "utf8") + await readFile(path.join(root, "app", "v2", "v2.css"), "utf8"));
const assetVersion = createHash("sha256").update(await readFile(path.join(dist, "app.js"))).update(await readFile(path.join(dist, "styles.css"))).digest("hex").slice(0, 12);
await writeFile(path.join(dist, "index.html"), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#355fd4"><meta name="description" content="CAPSED : facturation, encaissement et contrôle des clients, un espace par rôle."><title>CAPSED Facture</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700&display=swap"><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="styles.css?v=${assetVersion}"></head><body><div id="root"></div><script type="module" src="app.js?v=${assetVersion}"></script></body></html>`);
await copyFile(path.join(root, "public", "favicon.svg"), path.join(dist, "favicon.svg"));


await copyFile(path.join(root, "public", "capsed-letterhead.webp"), path.join(dist, "capsed-letterhead.webp"));
await copyFile(path.join(root, "public", "capsed-logo.png"), path.join(dist, "capsed-logo.png"));
