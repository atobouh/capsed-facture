// The files for capsed-facture.pages.dev: the cloud site build (dist-site, with the office app at /bureau/)
// plus the small forwarder that sends /api/ and /secours/ to the CAPSED Worker.
import { cp, rm, copyFile } from "node:fs/promises";
await rm("dist-pages", { recursive: true, force: true });
await cp("dist-site", "dist-pages", { recursive: true });
for (const f of ["_worker.js", "_routes.json"]) await copyFile(`cloud/pages/${f}`, `dist-pages/${f}`);
console.log("dist-pages ready");
