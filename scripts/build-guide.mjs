// The user manual: guide/src/*.html (content only) wrapped in one layout, with the table of contents built from the h2 titles.
//   node scripts/build-guide.mjs <out-dir> [<out-dir>…]   (default: dist-guide)
import { readFile, writeFile, mkdir, cp, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

const PAGES = [["index", "Accueil"], ["installation", "Installation"], ["facturation", "Facturation"], ["encaissement", "Encaissement"], ["direction", "Direction"], ["depannage", "Dépannage"]];
const outs = process.argv.slice(2).length ? process.argv.slice(2) : ["dist-guide"];
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const strip = s => s.replace(/<[^>]+>/g, "").trim();

const built = [];
for (const [file, label] of PAGES) {
  const src = await readFile(path.join("guide/src", file + ".html"), "utf8");
  const meta = src.match(/^<!--\s*title:\s*(.*?)\s*\|\s*lead:\s*(.*?)\s*-->/);
  if (!meta) throw new Error(`guide/src/${file}.html : ligne « <!-- title: … | lead: … --> » manquante`);
  const [, title, lead] = meta;
  // On a phone each table row becomes a small card: every cell carries its column title.
  const body = src.slice(meta[0].length).replace(/<table>([\s\S]*?)<\/table>/g, (_, inner) => {
    const heads = [...inner.matchAll(/<th>(.*?)<\/th>/g)].map(m => strip(m[1]));
    return "<table>" + inner.replace(/<tr>([\s\S]*?)<\/tr>/g, (row, cells) => /<th>/.test(cells) ? row : "<tr>" + (() => { let i = 0; return cells.replace(/<td(\s[^>]*)?>/g, (td, attrs = "") => `<td${attrs} data-label="${esc(heads[i++] ?? "")}">`); })() + "</tr>") + "</table>";
  });
  const toc = [...body.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map(m => `<a href="#${m[1]}">${strip(m[2])}</a>`).join("");
  const nav = PAGES.map(([f, l]) => `<a href="${f}.html"${f === file ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${file === "index" ? "Manuel CAPSED" : `${esc(title)} · Manuel CAPSED`}</title><meta name="description" content="${esc(strip(lead))}"><meta name="theme-color" content="#5E3A6B">
<link rel="icon" href="mark.svg"><link rel="stylesheet" href="guide.css"></head><body>
<header class="top"><div class="top-in"><a class="brand" href="index.html"><img src="mark.svg" alt=""><span>Manuel CAPSED<small>Facturation, encaissement, Direction</small></span></a>
<nav class="nav" aria-label="Pages du manuel">${nav}</nav><button type="button" class="back-app">Retour à l’application</button></div></header>
<div class="wrap">${toc ? `<nav class="toc" aria-label="Sur cette page"><strong>Sur cette page</strong>${toc}</nav>` : "<div></div>"}
<main><h1>${title}</h1><p class="lead">${lead}</p>${body}
<p class="foot">Manuel de CAPSED SUARL. Une question qui n’est pas ici ? Demandez à la Direction. · <a href="depannage.html">Dépannage</a> · <a href="https://capsed-facture.pages.dev">Site de la Direction</a></p></main></div>
<script src="guide.js"></script></body></html>`;
  built.push([file + ".html", html]);
}
for (const out of outs) {
  await mkdir(path.join(out, "img"), { recursive: true });
  for (const [f, html] of built) await writeFile(path.join(out, f), html);
  for (const f of ["guide.css", "guide.js", "mark.svg"]) await copyFile(path.join("guide", f), path.join(out, f));
  await cp("guide/img", path.join(out, "img"), { recursive: true });
  await mkdir(path.join(out, "fonts"), { recursive: true });
  for (const f of await readdir("public/fonts")) await copyFile(path.join("public/fonts", f), path.join(out, "fonts", f));
  console.log("manuel :", out);
}
