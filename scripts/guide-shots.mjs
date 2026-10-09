// Screenshots for the user manual (guide/img), taken from the real apps against a fresh local cloud:
//   npm run build:cloud && npm run build:pages, `wrangler dev` in cloud/ and `wrangler pages dev --service APP=capsed` in cloud/pages, then
//   node scripts/guide-shots.mjs   (PLAYWRIGHT=…/playwright-core/index.mjs CHROMIUM=…/chrome SITE=http://localhost:8788/ OUT=guide/img)
// Numbered markers show where to click. Run it again whenever the screens change.
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright-core");
const SITE = process.env.SITE ?? "http://localhost:8788/", OFFICE = SITE + "bureau/", OUT = (process.env.OUT ?? "guide/img").replace(/\/$/, "") + "/";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = async (vp, mobile) => { const c = await b.newContext({ viewport: vp, locale: "fr-FR", ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) }); return c.newPage(); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await f()) return true; } catch { /* encore */ } await wait(400); } return false; };
const btn = (p, name) => p.getByRole("button", { name }).first();
const done = [];

/** Numbered markers drawn on top of the page, around what to click. */
async function mark(p, items) {
  const boxes = [];
  for (const [n, loc] of items) { const bb = await loc.boundingBox().catch(() => null); if (bb) boxes.push([n, bb]); }
  await p.evaluate(list => {
    for (const [n, r] of list) {
      const ring = document.createElement("div"); ring.className = "guide-mark";
      Object.assign(ring.style, { position: "fixed", left: r.x - 5 + "px", top: r.y - 5 + "px", width: r.width + 10 + "px", height: r.height + 10 + "px", border: "3px solid #E5484D", borderRadius: "10px", zIndex: 99999, pointerEvents: "none", boxShadow: "0 0 0 4px #E5484D33" });
      const dot = document.createElement("div"); dot.className = "guide-mark"; dot.textContent = n;
      Object.assign(dot.style, { position: "fixed", left: Math.max(2, r.x - 18) + "px", top: Math.max(2, r.y - 18) + "px", width: "28px", height: "28px", borderRadius: "50%", background: "#E5484D", color: "#fff", font: "700 15px/28px system-ui, sans-serif", textAlign: "center", zIndex: 100000, pointerEvents: "none", boxShadow: "0 2px 6px #0004" });
      document.body.append(ring, dot);
    }
  }, boxes);
}
const unmark = p => p.evaluate(() => document.querySelectorAll(".guide-mark").forEach(e => e.remove()));
async function shot(p, name, marks = [], opts = {}) {
  await wait(250);
  if (marks.length) await mark(p, marks);
  await p.screenshot({ path: OUT + name + ".png", ...opts });
  await unmark(p);
  done.push(name);
}
const hideToasts = p => p.addStyleTag({ content: ".cx-toasts,.cx-toast-host,[class*=toast]{display:none!important}" });
const poke = p => p.evaluate(() => window.dispatchEvent(new Event("online")));
const sent = p => until(async () => /Tout est envoyé/.test(await p.locator(".cx-sidebar .cx-sync").textContent()), 60000);

try {
  // ——— Direction: first account ———
  const site = await page({ width: 1280, height: 800 });
  await site.goto(SITE);
  await site.getByText("Créer le compte de la Direction").waitFor();
  await site.locator("#name").fill("La Direction"); await site.locator("#login").fill("direction");
  await site.locator("#password").fill("Direction2026"); await site.locator("#again").fill("Direction2026");
  await shot(site, "dir-01-premier-compte", [[1, site.locator("#name")], [2, site.locator("#login")], [3, site.locator("#password")], [4, btn(site, "Créer le compte")]]);
  await btn(site, "Créer le compte").click();
  await site.locator(".cx-site-tabs").waitFor({ timeout: 20000 });
  await hideToasts(site);

  // ——— Direction: team ———
  await site.locator(".cx-site-tabs button", { hasText: "Réglages" }).click();
  await shot(site, "dir-10-reglages", [[1, site.locator(".cx-row", { hasText: "Équipe et accès" })]]);
  await site.locator(".cx-row", { hasText: "Équipe et accès" }).click();
  await btn(site, "Ajouter une personne").click();
  await site.locator(".cx-modal input").first().fill("Awa Ngo Mballa");
  await site.locator(".cx-modal input").nth(1).fill("awa@capsed.cm");
  await site.locator(".cx-choice-item", { hasText: /^Facturation/ }).first().click();
  await shot(site, "dir-11-ajouter-personne", [[1, site.locator(".cx-modal input").first()], [2, site.locator(".cx-choice-item", { hasText: /^Facturation/ }).first()], [3, site.locator(".cx-choice-item", { hasText: "Créé par l’application" })], [4, btn(site, "Créer son accès")]]);
  await btn(site, "Créer son accès").click();
  await site.locator(".cx-credential").waitFor();
  await shot(site, "dir-12-fiche-acces", [[1, site.locator(".cx-credential")], [2, btn(site, "Copier la fiche")]]);
  await btn(site, "C’est noté").click();
  await btn(site, "Ajouter une personne").click();
  await site.locator(".cx-modal input").first().fill("Paul Ekane");
  await site.locator(".cx-choice-item", { hasText: /^Encaissement/ }).first().click();
  await site.locator(".cx-choice-item", { hasText: "Je le choisis" }).click();
  await site.locator(".cx-modal input").last().fill("Paul2026x");
  await shot(site, "dir-13-mot-de-passe-choisi", [[1, site.locator(".cx-choice-item", { hasText: "Je le choisis" })], [2, site.locator(".cx-modal input").last()]]);
  await btn(site, "Créer son accès").click(); await btn(site, "C’est noté").click();
  const awaRow = site.locator(".cx-member", { hasText: "Awa Ngo Mballa" });
  await awaRow.getByRole("button", { name: /Afficher le mot de passe/ }).click();
  const awaPw = (await awaRow.locator(".cx-pw-line code").textContent()).trim();
  await awaRow.getByRole("button", { name: /Masquer le mot de passe/ }).click();
  await shot(site, "dir-14-equipe", [[1, btn(site, "Ajouter une personne")], [2, awaRow.getByRole("button", { name: /Afficher le mot de passe/ })], [3, awaRow.getByRole("button", { name: /Copier le mot de passe/ })], [4, awaRow.getByRole("button", { name: "Modifier" })], [5, awaRow.getByRole("button", { name: "Nouveau mot de passe" })]]);

  // ——— Direction: link a computer ———
  await btn(site, "Relier un ordinateur").click();
  await site.locator(".cx-big-code").waitFor();
  const code = (await site.locator(".cx-big-code").textContent()).replace(/\D/g, "");
  await shot(site, "dir-15-code-ordinateur", [[1, site.locator(".cx-big-code")]]);

  // ——— Office: link, sign in ———
  const office = await page({ width: 1280, height: 800 });
  await office.goto(OFFICE);
  await office.getByText("Relier cet ordinateur").waitFor();
  await office.locator("#code").fill(code); await office.locator("#device-name").fill("Facturation 1");
  await shot(office, "bur-01-relier", [[1, office.locator("#code")], [2, office.locator("#device-name")], [3, btn(office, "Relier l’ordinateur")]]);
  await btn(office, "Relier l’ordinateur").click();
  await until(async () => (await site.locator(".cx-modal", { hasText: "Ordinateur relié" }).count()) > 0, 30000);
  await shot(site, "dir-16-ordinateur-relie");
  await btn(site, "Terminé").click();
  await office.locator("#login").waitFor({ timeout: 40000 });
  await office.locator("#login").fill("awa"); await office.locator("#password").fill(awaPw);
  await shot(office, "bur-02-connexion", [[1, office.locator("#login")], [2, office.locator("#password")], [3, btn(office, "Se connecter")]]);
  await btn(office, "Se connecter").click();
  await office.locator(".cx-sidebar").waitFor();
  await hideToasts(office);

  // ——— Clients: import (Direction) and add (office) ———
  await site.locator(".cx-site-tabs button", { hasText: "Réglages" }).click();
  await site.locator(".cx-row", { hasText: "Données et sauvegarde" }).click();
  await btn(site, "Importer un fichier").click();
  await site.locator(".cx-modal input[type=file]").setInputFiles(new URL("../cloud/test/fixtures/clients.xlsx", import.meta.url).pathname);
  await until(async () => (await site.locator(".cx-modal .cx-notice").count()) > 0, 10000);
  await shot(site, "dir-30-import-clients", [[1, site.locator(".cx-modal .cx-file")], [2, site.locator(".cx-modal .cx-notice").first()], [3, site.locator(".cx-modal footer .cx-btn-primary")]]);
  await site.locator(".cx-modal footer .cx-btn-primary").click();
  await office.locator(".cx-sidebar nav button", { hasText: "Clients" }).click();
  await btn(office, "Ajouter un client").click();
  const cin = office.locator(".cx-modal input");
  await cin.nth(0).fill("EFMK SARL");
  await shot(office, "fac-20-nouveau-client", [[1, cin.nth(0)], [2, office.locator(".cx-modal footer .cx-btn-primary")]]);
  await office.locator(".cx-modal footer .cx-btn-primary").click(); await wait(400);
  await until(async () => { await poke(office); return (await office.locator(".cx-row").count()) >= 4; }, 40000);

  // ——— Facturation: an invoice in 4 steps ———
  await office.locator(".cx-sidebar nav button", { hasText: "Factures" }).click();
  await shot(office, "fac-01-factures-vide", [[1, btn(office, "Nouvelle facture")]]);
  await btn(office, "Nouvelle facture").click();
  await office.locator(".cx-search-row input").fill("EFMK");
  await shot(office, "fac-02-etape1-client", [[1, office.locator(".cx-search-row input")], [2, office.locator(".cx-pick-list button").first()], [3, btn(office, "Nouveau client")]]);
  await office.locator(".cx-pick-list button").first().click();
  await shot(office, "fac-03-etape1-facture", [[1, office.locator(".cx-form-grid input[type=date]")], [2, office.locator(".cx-choice-item", { hasText: "Facture TTC" })], [3, btn(office, /Continuer/)]]);
  await office.locator(".cx-choice-item", { hasText: "Facture TTC" }).click();
  await btn(office, /Continuer/).click();
  const line = office.locator(".cx-line").first();
  await line.locator("textarea").first().fill("Traitement phytosanitaire\nConteneur MSNU 923173-6");
  await line.locator("textarea").nth(1).fill("Kolkata");
  await line.locator("input").nth(0).fill("2"); await line.locator("input").nth(1).fill("45000");
  await shot(office, "fac-04-etape2-articles", [[1, line.locator("textarea").first()], [2, line.locator("input").nth(0)], [3, line.locator("input").nth(1)], [4, btn(office, "Ajouter un article")]]);
  await btn(office, /Continuer/).click();
  await shot(office, "fac-05-etape3-reglement", [[1, office.locator(".cx-choice-compact").first()], [2, office.locator(".cx-form-grid").first()]]);
  await btn(office, /Continuer/).click();
  await shot(office, "fac-06-etape4-verifier", [[1, office.locator(".cx-recap")], [2, btn(office, /Émettre la facture/)]]);
  await btn(office, /Émettre la facture/).click(); await wait(600);
  // Two more invoices for a lived-in register.
  for (const [who, what, qty, price] of [["Port Autonome", "Dératisation des entrepôts", 1, 350000], ["Société Agricole", "Désherbage chimique\nParcelle B, 12 ha", 12, 25000]]) {
    await office.locator(".cx-sidebar nav button", { hasText: "Factures" }).click();
    await btn(office, "Nouvelle facture").click();
    await office.locator(".cx-search-row input").fill(who); await office.locator(".cx-pick-list button").first().click();
    await btn(office, /Continuer/).click();
    const l = office.locator(".cx-line").first(); await l.locator("textarea").first().fill(what); await l.locator("input").nth(0).fill(String(qty)); await l.locator("input").nth(1).fill(String(price));
    await btn(office, /Continuer/).click(); await btn(office, /Continuer/).click(); await btn(office, /Émettre la facture/).click(); await wait(600);
  }
  await office.locator(".cx-sidebar nav button", { hasText: "Factures" }).click();
  await shot(office, "fac-07-registre", [[1, office.locator(".cx-month").first()], [2, office.locator(".cx-table tbody tr").first()], [3, btn(office, "Imprimer")], [4, office.locator(".cx-side-panel .cx-panel-actions").getByRole("button", { name: "Autres actions" })]]);
  await btn(office, "Marquer remise").click().catch(() => {});
  await wait(300);
  await office.locator(".cx-page-head").getByRole("button", { name: "Autres actions" }).click();
  await shot(office, "fac-08-menu-ancienne", [[1, office.getByRole("menuitem", { name: /Ajouter une ancienne facture/ })]]);
  await office.getByRole("menuitem", { name: /Ajouter une ancienne facture/ }).click();
  await office.locator(".cx-search-row input").fill("EFMK"); await office.locator(".cx-pick-list button").first().click();
  await office.locator(".cx-form-grid input").first().fill("2026-06-015");
  await office.locator(".cx-form-grid input[type=date]").fill("2026-06-12");
  await shot(office, "fac-09-ancienne-facture", [[1, office.locator(".cx-notice").first()], [2, office.locator(".cx-form-grid input").first()], [3, office.locator(".cx-form-grid input[type=date]")]]);
  await btn(office, /Continuer/).click();
  const ol = office.locator(".cx-line").first(); await ol.locator("textarea").first().fill("Dératisation (facture papier)"); await ol.locator("input").nth(0).fill("1"); await ol.locator("input").nth(1).fill("80000");
  await btn(office, /Continuer/).click(); await btn(office, /Continuer/).click(); await btn(office, /Enregistrer l’ancienne facture/).click(); await wait(600);
  // Credit note dialog
  await office.locator(".cx-sidebar nav button", { hasText: "Factures" }).click();
  await office.locator(".cx-month").first().getByRole("button", { name: "Mois suivant" }).click().catch(() => {});
  await until(async () => (await office.locator(".cx-table tbody tr").count()) >= 3, 5000);
  await btn(office, "Créer un avoir").click();
  await wait(300);
  await shot(office, "fac-10-avoir");
  await office.keyboard.press("Escape"); await office.locator(".cx-modal footer").getByRole("button", { name: /Annuler|Fermer/ }).first().click().catch(() => {});
  await wait(300);
  // Sync status, lock
  await sent(office);
  await shot(office, "bur-03-statut-envoi", [[1, office.locator(".cx-sidebar .cx-sync")], [2, office.locator(".cx-user-actions")]]);
  await office.locator(".cx-user-actions").getByRole("button", { name: "Verrouiller" }).click();
  await shot(office, "bur-04-verrouille", [[1, office.locator("#unlock-password")], [2, office.getByRole("button", { name: /changer d’utilisateur/ })]]);
  await office.locator("#unlock-password").fill(awaPw); await btn(office, "Déverrouiller").click();
  await wait(300);
  // Offline
  await office.context().setOffline(true); await office.evaluate(() => window.dispatchEvent(new Event("offline")));
  await office.locator(".cx-sidebar nav button", { hasText: "Factures" }).click();
  await btn(office, "Nouvelle facture").click();
  await office.locator(".cx-search-row input").fill("Hôtel"); await office.locator(".cx-pick-list button").first().click();
  await btn(office, /Continuer/).click();
  const hl = office.locator(".cx-line").first(); await hl.locator("textarea").first().fill("Démoustication"); await hl.locator("input").nth(0).fill("1"); await hl.locator("input").nth(1).fill("150000");
  await btn(office, /Continuer/).click(); await btn(office, /Continuer/).click(); await btn(office, /Émettre la facture/).click(); await wait(800);
  await until(async () => /attente/.test(await office.locator(".cx-sidebar .cx-sync").textContent()), 15000);
  await shot(office, "bur-05-hors-ligne", [[1, office.locator(".cx-sidebar .cx-sync")]]);
  await office.context().setOffline(false); await poke(office); await sent(office);

  // ——— Encaissement: Paul ———
  await office.locator(".cx-user-actions").getByRole("button", { name: "Se déconnecter" }).click();
  await office.locator("#login").fill("paul"); await office.locator("#password").fill("Paul2026x");
  await btn(office, "Se connecter").click(); await office.locator(".cx-sidebar").waitFor();
  await shot(office, "enc-01-clients-paiements", [[1, office.locator(".cx-sidebar nav button", { hasText: "Clients et paiements" })], [2, office.locator(".cx-row").first()]]);
  await office.locator(".cx-row", { hasText: "EFMK" }).first().click();
  await shot(office, "enc-02-compte-client", [[1, btn(office, "Encaisser")]]);
  await btn(office, "Encaisser").click();
  await office.locator(".cx-modal input").first().fill("50000");
  await office.locator(".cx-modal .cx-choice-item", { hasText: /^OM$|Orange/ }).first().click();
  await shot(office, "enc-03-paiement", [[1, office.locator(".cx-modal input").first()], [2, office.locator(".cx-modal .cx-choice").first()], [3, office.locator(".cx-modal footer .cx-btn-primary")]]);
  await office.locator(".cx-modal footer .cx-btn-primary").click(); await wait(500);
  await btn(office, "Encaisser").click();
  await office.locator(".cx-modal input").first().fill("50000");
  await office.locator(".cx-modal .cx-choice-item", { hasText: /^OM$|Orange/ }).first().click();
  await wait(300);
  await shot(office, "enc-04-doublon", [[1, office.locator(".cx-modal .cx-notice", { hasText: "ressemble" })]]);
  await office.locator(".cx-modal .cx-confirm input").check();
  await office.locator(".cx-modal footer .cx-btn-primary").click(); await wait(500);
  await sent(office);

  // ——— Direction: validate, flags, overrides ———
  await site.locator(".cx-site-tabs button", { hasText: "Factures" }).click();
  await until(async () => { await poke(site); return (await site.locator(".cx-pay-card").count()) >= 5; }, 60000);
  await shot(site, "dir-20-nouveau-a-valider", [[1, site.locator(".cx-notice", { hasText: "à vérifier" })], [2, site.locator(".cx-pay-card").first()], [3, site.locator(".cx-flag").first()], [4, site.locator(".cx-actionbar .cx-btn-primary")]]);
  const dupCard = site.locator(".cx-pay-card", { hasText: "Doublon possible" }).first();
  if (await dupCard.count()) { await dupCard.getByRole("button", { name: "Annuler ce doublon" }).click(); await shot(site, "dir-21-annuler-doublon"); await site.locator(".cx-modal footer").getByRole("button", { name: "Annuler ce paiement" }).click(); await wait(400); }
  await site.locator(".cx-actionbar .cx-btn-primary").click();
  await shot(site, "dir-22-valider");
  await site.locator(".cx-modal footer .cx-btn-primary").click(); await wait(600);
  await site.locator(".cx-site-tabs button", { hasText: "Accueil" }).click(); await wait(400);
  await shot(site, "dir-02-accueil", [[1, site.locator(".cx-site-tabs")], [2, site.locator(".cx-fresh, .cx-freshness").first()]]);
  await site.locator(".cx-row", { hasText: "EFMK" }).first().click(); await wait(400);
  await shot(site, "dir-23-client");
  const payRow = site.getByRole("button", { name: "Déverrouiller" }).first();
  if (await payRow.count()) { await payRow.click(); await site.locator(".cx-modal textarea").fill("Erreur de montant signalée par le client"); await shot(site, "dir-24-deverrouiller", [[1, site.locator(".cx-lift-effect")], [2, site.locator(".cx-modal textarea")]]); await site.locator(".cx-modal footer .cx-btn-primary").click(); await wait(400); }
  await site.locator(".cx-site-tabs button", { hasText: "Situation" }).click(); await wait(500);
  await shot(site, "dir-25-situation");
  await site.locator(".cx-site-tabs button", { hasText: "Réglages" }).click();
  await site.locator(".cx-row", { hasText: "Règles et dérogations" }).click(); await wait(300);
  await shot(site, "dir-26-regles", [[1, site.locator("#set-overrides").locator("xpath=ancestor::section")]]);
  await site.locator(".cx-back").click();
  await site.locator(".cx-row", { hasText: "Données et sauvegarde" }).click(); await wait(300);
  await shot(site, "dir-31-export", [[1, btn(site, "Tout exporter (.zip)")], [2, btn(site, "Importer un fichier")]]);
  await site.locator(".cx-back").click();
  await site.locator(".cx-row", { hasText: "Équipe et accès" }).click(); await wait(300);
  await site.locator("#set-sessions").scrollIntoViewIfNeeded();
  await shot(site, "dir-32-connexions", [[1, btn(site, "Déconnecter les autres appareils")]]);

  // ——— Phone ———
  const phone = await page({ width: 390, height: 844 }, true);
  await phone.goto(SITE);
  await phone.locator("#login").fill("direction"); await phone.locator("#password").fill("Direction2026");
  await btn(phone, "Se connecter").click(); await phone.locator(".cx-bottom-nav").waitFor({ timeout: 30000 });
  await wait(1500); await hideToasts(phone);
  await shot(phone, "tel-01-accueil", [[1, phone.locator(".cx-bottom-nav")]]);
  await phone.locator(".cx-bottom-nav button", { hasText: "Factures" }).click(); await wait(500);
  await shot(phone, "tel-02-factures");

  // ——— Removed computer ———
  await site.locator("#set-devices").scrollIntoViewIfNeeded();
  await site.locator("#set-devices").locator("xpath=ancestor::section").locator(".cx-list-row", { hasText: "Facturation 1" }).getByRole("button", { name: "Retirer" }).click();
  await site.locator(".cx-modal footer").getByRole("button", { name: "Retirer l’ordinateur" }).click();
  await until(async () => { await poke(office); return (await office.getByText("Cet ordinateur a été retiré").count()) > 0; }, 60000);
  await shot(office, "bur-06-ordinateur-retire", [[1, office.locator(".cx-notice").first()]]);

  // ——— The desktop opening card ———
  const card = await page({ width: 360, height: 240 });
  await card.goto(OFFICE + "splash.html").catch(() => {});
  if (await card.locator(".card").count()) await shot(card, "bur-00-ouverture");
} catch (e) { console.error("ERREUR", e.message.split("\n")[0]); }
console.log(done.length + " captures :", done.join(", "));
await b.close();
