// End-to-end: Direction site + office app (/bureau/) against a fresh local cloud: `npm run build:cloud`, `wrangler dev` in cloud/, then
// node cloud/test/e2e.mjs   (PLAYWRIGHT=path/to/playwright-core/index.mjs CHROMIUM=path/to/chrome if not installed globally)
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright-core');
const S = process.env.SHOTS ?? '/tmp/capsed-e2e/', SITE = process.env.SITE ?? 'http://localhost:8787/', OFFICE = process.env.OFFICE ?? 'http://localhost:8787/bureau/';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const log = [], errs = [];
mkdirSync(S, { recursive: true });
const ok = (cond, msg) => { log.push((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) errs.push(msg); };
async function ctx(vp, mobile) { const c = await b.newContext({ viewport: vp, locale: 'fr-FR', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) }); const p = await c.newPage(); p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); return p; }
const shot = (p, n, full) => p.screenshot({ path: S + n + '.png', fullPage: !!full });
const btn = (p, t) => p.getByRole('button', { name: t }).first();
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000, step = 300) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* retry */ } await wait(step); } return false; }

const site = await ctx({ width: 1280, height: 820 });
const office = await ctx({ width: 1366, height: 800 });
let awaPw = '', paulPw = '', code = '';
try {
  // 1. First Direction account.
  await site.goto(SITE);
  await site.getByText('Créer le compte de la Direction').waitFor();
  await shot(site, '01-setup');
  await site.locator('#name').fill('La Direction'); await site.locator('#login').fill('direction');
  await site.locator('#password').fill('secret12'); await site.locator('#again').fill('secret12');
  await btn(site, 'Créer le compte').click();
  await site.locator('.cx-site-tabs').waitFor({ timeout: 15000 });
  await shot(site, '02-site-home');
  ok(true, 'Direction account created, site opens');

  // 2. Team accounts and a computer code.
  await site.locator('.cx-site-tabs button', { hasText: 'Réglages' }).click();
  await shot(site, '03-reglages');
  await site.locator('.cx-row', { hasText: 'Équipe et accès' }).click();
  for (const [name, role] of [['Awa Ngo', 'Facturation'], ['Paul Ekane', 'Encaissement']]) {
    await btn(site, 'Ajouter une personne').click();
    await site.locator('.cx-modal input').first().fill(name);
    await site.locator('.cx-choice-item', { hasText: new RegExp('^' + role) }).first().click();
    // Paul's password is chosen by the Direction.
    if (name.startsWith('Paul')) { await site.locator('.cx-choice-item', { hasText: 'Je le choisis' }).click(); await site.locator('.cx-modal input').last().fill('Paul2026x'); }
    await btn(site, 'Créer son accès').click();
    const dd = site.locator('.cx-credential dd');
    await dd.nth(2).waitFor();
    const pw = await dd.nth(2).textContent();
    if (name.startsWith('Awa')) awaPw = pw; else paulPw = pw;
    if (name.startsWith('Awa')) await shot(site, '04-credential');
    await btn(site, 'C’est noté').click();
  }
  ok(awaPw && paulPw === 'Paul2026x', `team passwords shown (${awaPw}, chosen: ${paulPw})`);
  ok(await until(async () => (await site.evaluate(() => localStorage.getItem('capsed-site-sync-outbox'))) === '[]', 20000), 'Direction changes sent');
  // 2b. Edit a person (name, e-mail) and read the password again.
  const awaRow = site.locator('.cx-member', { hasText: 'Awa Ngo' });
  await awaRow.getByRole('button', { name: 'Modifier' }).click();
  await site.locator('.cx-modal input').first().fill('Awa Ngo Mballa');
  await site.locator('.cx-modal input').nth(1).fill('awa@capsed.cm');
  await site.locator('.cx-modal footer').getByRole('button', { name: 'Enregistrer' }).click();
  const awaRow2 = site.locator('.cx-member', { hasText: 'Awa Ngo Mballa' });
  ok(await until(async () => (await awaRow2.textContent()).includes('awa@capsed.cm'), 5000), 'name and e-mail changed');
  await awaRow2.getByRole('button', { name: 'Afficher' }).click();
  ok((await awaRow2.locator('.cx-pw-line code').textContent()) === awaPw, 'the Direction reads the password again');
  await shot(site, '06-team-edited');
  await awaRow2.getByRole('button', { name: 'Fiche d’accès' }).click();
  ok((await site.locator('.cx-credential dd').nth(2).textContent()) === awaPw, 'access sheet shows the password any time');
  await btn(site, 'C’est noté').click();
  // 2c. Password copied with its own icon.
  await site.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await awaRow2.getByRole('button', { name: /Copier le mot de passe/ }).click();
  ok(await until(async () => (await site.evaluate(() => navigator.clipboard.readText().catch(() => ''))) === awaPw, 3000), 'copy icon copies just the password');
  await btn(site, 'Relier un ordinateur').click();
  await site.locator('.cx-big-code').waitFor();
  code = (await site.locator('.cx-big-code').textContent()).replace(/\D/g, '');
  await shot(site, '05-device-code');
  ok(code.length === 6, 'computer code ' + code);

  // 3. Office: link the computer, sign in.
  await office.goto(OFFICE);
  await office.getByText('Relier cet ordinateur').waitFor();
  await shot(office, '10-enroll');
  await office.locator('#code').fill(code); await office.locator('#device-name').fill('Facturation 1');
  await btn(office, 'Relier l’ordinateur').click();
  ok(await until(async () => (await site.locator('.cx-modal', { hasText: 'Ordinateur relié' }).count()) > 0, 20000), 'the Direction sees the computer linked without reloading');
  await shot(site, '05b-device-linked');
  await btn(site, 'Terminé').click();
  await office.locator('#login').waitFor({ timeout: 30000 });
  await shot(office, '11-office-login');
  await office.locator('#login').fill('awa'); await office.locator('#password').fill(awaPw);
  await btn(office, 'Se connecter').click();
  await office.locator('.cx-sidebar').waitFor();
  ok(true, 'office linked and Awa signed in');
  await shot(office, '12-office-register');

  // 4. Client and invoice on the office, sent to the cloud.
  await office.locator('.cx-sidebar nav button', { hasText: 'Clients' }).click();
  await btn(office, 'Ajouter un client').click();
  await office.locator('.cx-modal input').first().fill('EFMK SARL');
  await btn(office, 'Ajouter le client').click();
  await wait(400);
  await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
  async function issue(designation, qty, price) {
    await office.keyboard.press('Control+n');
    await office.locator('.cx-pick-list button').first().click();
    await btn(office, /Continuer/).click();
    await office.locator('.cx-line textarea').first().fill(designation);
    const ins = office.locator('.cx-line input'); await ins.nth(0).fill(String(qty)); await ins.nth(1).fill(String(price));
    await btn(office, /Continuer/).click(); await btn(office, /Continuer/).click();
    await btn(office, /Émettre la facture/).click();
    await wait(500);
  }
  await issue('Désherbage chimique', 15, 30000);
  // A long invoice runs over several A4 pages, totals on the last one.
  await office.keyboard.press('Control+n');
  await office.locator('.cx-pick-list button').first().click();
  await btn(office, /Continuer/).click();
  for (let k = 0; k < 26; k++) {
    if (k) await btn(office, 'Ajouter un article').click();
    const line = office.locator('.cx-line').nth(k);
    await line.locator('textarea').first().fill(`Traitement phytosanitaire\nConteneur MSNU ${923100 + k}-6`);
    const ins = line.locator('input'); await ins.nth(0).fill('1'); await ins.nth(1).fill('45000');
  }
  await btn(office, /Continuer/).click(); await btn(office, /Continuer/).click();
  const pages = await office.locator('.cx-review .document-page').count();
  ok(pages >= 2 && pages <= 4, `26 lines make ${pages} pages`);
  const rows = await office.locator('.cx-review .document-page').evaluateAll(ps => ps.map(pg => pg.querySelectorAll('tbody tr').length));
  ok(rows.reduce((a, n) => a + n, 0) === 26 && rows.slice(1, -1).every(n => n >= 8) && rows.at(-1) >= 1, `lines per page ${rows.join(', ')}, none lost`);
  ok(await office.locator('.cx-review .document-page').last().locator('.receipt-totals').count() === 1 && await office.locator('.cx-review .receipt-totals').count() === 1, 'totals only on the last page');
  await shot(office, '15-long-invoice', true);
  await btn(office, /Émettre la facture/).click(); await wait(500);
  ok(await until(async () => /Tout est envoyé/.test(await office.locator('.cx-sidebar .cx-sync').textContent()), 20000), 'office shows « Tout est envoyé »');
  await shot(office, '13-office-sent');

  // 4b. An old invoice (made before the app), typed in with its original number and date.
  const cur = new Date().toISOString().slice(0, 7), od = new Date(); od.setDate(1); od.setMonth(od.getMonth() - 4);
  const oldMonth = od.toISOString().slice(0, 7), oldNumber = `${oldMonth}-015`;
  async function addOld(number) {
    await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
    await office.locator('.cx-page-head').getByRole('button', { name: 'Autres actions' }).click();
    await office.getByRole('menuitem', { name: /Ajouter une ancienne facture/ }).click();
    await office.locator('.cx-pick-list button').first().click();
    await office.locator('.cx-form-grid input').first().fill(number);
    await office.locator('.cx-form-grid input[type=date]').fill(`${oldMonth}-12`);
    await btn(office, /Continuer/).click();
  }
  await addOld(oldNumber);
  await office.locator('.cx-line textarea').first().fill('Dératisation (facture papier)');
  const oi = office.locator('.cx-line input'); await oi.nth(0).fill('1'); await oi.nth(1).fill('80000');
  await btn(office, /Continuer/).click(); await btn(office, /Continuer/).click();
  await shot(office, '16-old-invoice-review');
  await btn(office, /Enregistrer l’ancienne facture/).click(); await wait(500);
  ok(/ancienne facture du/.test(await office.locator('.cx-page-head').first().textContent()), 'the old invoice opens, dated as on paper');
  await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
  ok(await office.locator('.cx-doc-link', { hasText: oldNumber }).count() === 1 && await office.locator('.cx-legacy-tag').count() > 0, `old invoice ${oldNumber} saved with its own number and date, tagged « Ancienne »`);
  await shot(office, '17-old-invoice-register');
  await addOld(oldNumber);
  ok(await office.locator('.cx-notice', { hasText: 'existe déjà' }).count() === 1, 'the same number twice is refused');
  await btn(office, 'Quitter sans enregistrer').click();

  // 5. The Direction sees it.
  await site.locator('.cx-site-tabs button', { hasText: 'Factures' }).click();
  ok(await until(async () => { await site.evaluate(() => window.dispatchEvent(new Event('online'))); return (await site.locator('.cx-pay-card', { hasText: 'facture 2026-' }).count()) > 0; }, 40000, 1000), 'Direction sees the office invoice to validate');
  await shot(site, '14-site-factures');
  ok(await until(async () => { await site.evaluate(() => window.dispatchEvent(new Event('online'))); return (await site.locator('.cx-pay-card', { hasText: oldNumber }).count()) > 0; }, 40000, 1000), 'Direction receives the old invoice, marked as such');

  const sent = () => until(async () => /Tout est envoyé/.test(await office.locator('.cx-sidebar .cx-sync').textContent()), 90000, 500);
  const poke = p => p.evaluate(() => window.dispatchEvent(new Event('online')));
  const siteRows = async () => { await poke(site); return site.locator('.cx-bills .cx-rows .cx-row').count(); };

  // 6. A whole invoice made without internet, sent when the network comes back.
  await office.context().setOffline(true);
  await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
  await issue('Dératisation entrepôt', 2, 120000);
  ok(await until(async () => /en attente/.test(await office.locator('.cx-sidebar .cx-sync').textContent()), 15000), 'offline: office keeps working and shows what waits');
  await shot(office, '20-office-offline');
  await office.context().setOffline(false); await poke(office);
  ok(await sent(), 'back online: everything sent');
  ok(await until(async () => (await siteRows()) === 3, 40000, 1000), 'Direction sees the invoice made offline');
  await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
  ok(await office.locator('.cx-doc-link', { hasText: new RegExp(`^${cur}-003$`) }).count() === 1, 'automatic numbering goes on as before (old invoice not counted)');

  // 7. A send cut after the cloud received it: sent again, nothing doubled.
  let cut = false;
  await office.route('**/api/sync', async route => { if (route.request().method() === 'POST' && !cut) { cut = true; await route.fetch(); return route.abort('connectionreset'); } return route.continue(); });
  await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
  await issue('Démoustication bureaux', 4, 15000);
  ok(await sent(), 'after a cut answer, the send is retried and completes');
  ok(cut, 'the cut happened');
  await office.unroute('**/api/sync');
  ok(await until(async () => (await siteRows()) === 4, 40000, 1000), 'exactly 4 invoices on the Direction side, no double');
  const numbers = await site.locator('.cx-bills .cx-rows .cx-row .cx-row-main strong').allTextContents();
  ok(new Set(numbers).size === numbers.length, 'invoice numbers unique: ' + numbers.join(', '));

  // 8. Very slow network (about 24 kbit/s, 1.5 s latency).
  const cdp = await office.context().newCDPSession(office);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 3000, uploadThroughput: 3000 });
  await office.locator('.cx-sidebar nav button', { hasText: 'Factures' }).click();
  const t0 = Date.now();
  await issue('Traitement phytosanitaire\nConteneur MSNU 923173-6', 1, 650000);
  ok(await sent(), `slow network: sent in ${Math.round((Date.now() - t0) / 1000)} s`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 9. Paul enters a payment on the same computer.
  await office.getByRole('button', { name: 'Se déconnecter' }).click();
  await office.locator('#login').fill('paul'); await office.locator('#password').fill(paulPw);
  await btn(office, 'Se connecter').click();
  await office.locator('.cx-sidebar').waitFor();
  ok((await office.locator('.cx-sidebar nav button').allTextContents()).join('|').includes('Clients et paiements') && !(await office.locator('.cx-sidebar nav button').allTextContents()).join('|').includes('Factures'), 'Paul only sees Encaissement tabs');
  if (await office.locator('.cx-row').count()) await office.locator('.cx-row').first().click().catch(() => {});
  await btn(office, 'Encaisser').click();
  await office.locator('.cx-modal input').first().fill('200000');
  await office.locator('.cx-modal .cx-choice-item', { hasText: 'Espèces' }).click();
  await office.locator('.cx-modal footer .cx-btn-primary').click();
  ok(await sent(), 'payment sent');
  await shot(office, '30-paul-payment');

  // 10. The Direction validates everything new.
  await site.locator('.cx-site-tabs button', { hasText: 'Factures' }).click();
  ok(await until(async () => { await poke(site); return (await site.locator('.cx-pay-card', { hasText: 'Paiement' }).count()) === 1; }, 40000, 1000), 'Direction sees the payment to validate');
  await shot(site, '31-site-to-validate');
  await site.locator('.cx-actionbar-total').getByRole('button', { name: 'Valider' }).click();
  await btn(site, 'Valider').last().click().catch(() => {});
  await site.locator('.cx-modal').getByRole('button', { name: 'Valider' }).click().catch(() => {});
  ok(await until(async () => (await site.locator('.cx-pay-card').count()) === 0, 20000), 'everything validated');
  ok(await until(async () => (await site.evaluate(() => localStorage.getItem('capsed-site-sync-outbox'))) === '[]', 20000), 'validation sent');
  await poke(office);
  ok(await until(async () => { await poke(office); return (await office.getByText('Validé par la Direction').count()) > 0; }, 40000, 1500), 'office receives the validation (payment locked)');
  await shot(office, '32-office-locked');

  // 11. Lift the rule: the Direction unlocks the payment with a reason, then undoes it.
  await site.locator('.cx-site-tabs button', { hasText: 'Accueil' }).click();
  await site.locator('.cx-home-main .cx-row').first().click();
  await site.getByRole('button', { name: 'Déverrouiller' }).first().click();
  await shot(site, '40-unlock-dialog');
  await site.locator('.cx-modal footer').getByRole('button', { name: 'Déverrouiller' }).click();
  ok(await site.getByText('Écrivez le motif en quelques mots.').count() > 0, 'a reason is required');
  await site.locator('.cx-modal textarea').fill('Erreur de montant signalée par le client');
  await site.locator('.cx-modal footer').getByRole('button', { name: 'Déverrouiller' }).click();
  ok(await until(async () => (await site.getByRole('button', { name: 'Valider' }).count()) > 0, 10000), 'payment unlocked (Valider again)');
  await site.locator('.cx-site-tabs button', { hasText: 'Réglages' }).click();
  await site.locator('.cx-row', { hasText: 'Règles et dérogations' }).click();
  ok(await until(async () => (await site.getByText('Déverrouiller le paiement').count()) > 0, 10000), 'the override is listed with its reason');
  await shot(site, '41-overrides', true);
  await btn(site, 'Revenir en arrière').click();
  await shot(site, '42-undo-dialog');
  await site.locator('.cx-modal textarea').fill('Montant vérifié, il était juste');
  await site.locator('.cx-modal footer').getByRole('button', { name: 'Revenir en arrière' }).click();
  ok(await until(async () => (await site.getByText(/Annulée le/).count()) > 0, 10000), 'undo recorded');
  ok(await until(async () => (await site.evaluate(() => localStorage.getItem('capsed-site-sync-outbox'))) === '[]', 20000), 'override and undo sent');

  // 12. A correction made offline crosses a validation: kept, and back to validate.
  await office.locator('.cx-sidebar nav button', { hasText: 'Clients et paiements' }).click();
  if (await office.locator('.cx-row').count()) await office.locator('.cx-row').first().click().catch(() => {});
  await btn(office, 'Encaisser').click();
  await office.locator('.cx-modal input').first().fill('50000');
  await office.locator('.cx-modal .cx-choice-item', { hasText: 'Espèces' }).click();
  await office.locator('.cx-modal footer .cx-btn-primary').click();
  ok(await sent(), 'second payment sent');
  await office.context().setOffline(true);
  await office.getByRole('button', { name: 'Corriger' }).first().click();
  await office.locator('.cx-modal input').first().fill('55000');
  await office.locator('.cx-modal footer .cx-btn-primary').click();
  await site.locator('.cx-site-tabs button', { hasText: 'Factures' }).click();
  ok(await until(async () => { await poke(site); return (await site.locator('.cx-pay-card', { hasText: 'Paiement' }).count()) === 1; }, 40000, 1000), 'Direction sees the second payment');
  await site.locator('.cx-actionbar-total').getByRole('button', { name: 'Valider' }).click();
  await site.locator('.cx-modal').getByRole('button', { name: 'Valider' }).click();
  ok(await until(async () => (await site.evaluate(() => localStorage.getItem('capsed-site-sync-outbox'))) === '[]', 20000), 'validated before the correction arrived');
  await office.context().setOffline(false); await poke(office);
  ok(await sent(), 'offline correction sent');
  ok(await until(async () => { await poke(site); return (await site.locator('.cx-pay-card', { hasText: '55 000' }).count()) === 1; }, 40000, 1000), 'corrected payment (55 000) is back to validate, nothing lost');
  await shot(site, '50-conflict');

  // 13. Phone screens.
  const phone = await ctx({ width: 390, height: 844 }, true);
  await phone.goto(SITE);
  await phone.locator('#login').fill('direction'); await phone.locator('#password').fill('secret12');
  await btn(phone, 'Se connecter').click();
  await phone.locator('.cx-bottom-nav').waitFor({ timeout: 20000 });
  await until(async () => (await phone.locator('.cx-home-main .cx-row').count()) > 0, 20000);
  await shot(phone, '60-phone-home');
  await phone.locator('.cx-bottom-nav button', { hasText: 'Factures' }).click(); await wait(500); await shot(phone, '61-phone-factures');
  await phone.locator('.cx-bottom-nav button', { hasText: 'Réglages' }).click(); await wait(300); await shot(phone, '62-phone-reglages');
  await phone.locator('.cx-row', { hasText: 'Données et sauvegarde' }).click(); await wait(300); await shot(phone, '63-phone-donnees', true);
  await phone.context().setOffline(true); await phone.evaluate(() => window.dispatchEvent(new Event('offline')));
  await phone.locator('.cx-bottom-nav button', { hasText: 'Accueil' }).click(); await wait(300);
  await phone.reload().catch(() => {});
  ok(await until(async () => (await phone.locator('.cx-home-main .cx-row').count()) > 0, 15000), 'phone offline: the site still opens with its saved data');
  await shot(phone, '64-phone-offline');
  ok(await phone.getByText(/hors ligne/i).count() > 0, 'phone offline: says so');

  // 14. A second office computer on a terrible link (about 20 kbit/s, 2 s latency), and the reply to its code is lost once.
  await site.locator('.cx-site-tabs button', { hasText: 'Réglages' }).click();
  await site.locator('.cx-row', { hasText: 'Équipe et accès' }).click();
  await btn(site, 'Relier un ordinateur').click();
  await site.locator('.cx-big-code').waitFor();
  const code2 = (await site.locator('.cx-big-code').textContent()).replace(/\D/g, '');
  const slowPc = await ctx({ width: 1366, height: 800 });
  let lost = 0;
  await slowPc.route('**/api/devices/enroll', async route => { if (lost++ === 0) { await route.fetch(); await route.abort('connectionreset'); } else await route.continue(); });
  await slowPc.goto(OFFICE);
  await slowPc.getByText('Relier cet ordinateur').waitFor();
  const cdp2 = await slowPc.context().newCDPSession(slowPc);
  await cdp2.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: 2500, uploadThroughput: 2500 });
  await slowPc.locator('#code').fill(code2); await slowPc.locator('#device-name').fill('Encaissement');
  const tLink = Date.now();
  await btn(slowPc, 'Relier l’ordinateur').click();
  ok(await until(async () => (await slowPc.locator('#login').count()) > 0 || (await slowPc.getByText('Première récupération').count()) > 0, 60000, 500), `linked despite the lost reply (${lost} tries)`);
  await shot(slowPc, '70-slow-first-download');
  ok(await until(async () => (await slowPc.locator('#login').count()) > 0, 240000, 1000), `slow link: first download finished in ${Math.round((Date.now() - tLink) / 1000)} s, sign-in ready`);
  ok(await until(async () => (await site.locator('.cx-modal', { hasText: 'Ordinateur relié' }).count()) > 0, 20000), 'the Direction sees the second computer linked');
  const { devices } = await site.evaluate(() => fetch('/api/devices', { headers: { 'x-capsed': '1' } }).then(r => r.json()));
  ok(devices.filter(d => d.name === 'Encaissement' && !d.revoked_at).length === 1, 'one computer, not two, after the retry');
  await btn(site, 'Terminé').click();
  await cdp2.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await slowPc.locator('#login').fill('paul'); await slowPc.locator('#password').fill('Paul2026x');
  await btn(slowPc, 'Se connecter').click();
  ok(await until(async () => (await slowPc.locator('.cx-sidebar').count()) > 0, 15000), 'Paul signs in on the second computer with the password the Direction chose');
} catch (e) { errs.push('STEP ' + e.message.split('\n')[0]); await shot(site, 'ERR-site').catch(() => {}); await shot(office, 'ERR-office').catch(() => {}); }
console.log(log.join('\n')); console.log('\nERRORS:\n' + (errs.join('\n') || 'none'));
await b.close();
