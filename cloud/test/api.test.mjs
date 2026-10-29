// API tests against a running `wrangler dev` (local D1). Run: node --test cloud/test/api.test.mjs
// Expects a fresh database and RECOVERY_KEY=test-recovery-key-0123456789abcdef.
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { webcrypto } from "node:crypto";

const B = process.env.API ?? "http://127.0.0.1:8787";
const uid = () => webcrypto.randomUUID();
let cookie = "", dirId = "", device = null, token = "";
const awa = { id: uid(), name: "Awa Ngo", role: "facturation", login: "awa", active: true };
const paul = { id: uid(), name: "Paul Ekane", role: "encaissement", login: "paul", active: true };

async function call(path, { method = "GET", body, auth, gzip, headers = {} } = {}) {
  const h = { ...headers };
  if (auth === "web") { h.cookie = cookie; h["x-capsed"] = "1"; }
  if (auth === "device") h.authorization = "Bearer " + token;
  let payload;
  if (body !== undefined) { h["content-type"] = "application/json"; payload = JSON.stringify(body); if (gzip) { payload = gzipSync(payload); h["content-encoding"] = "gzip"; } }
  const r = await fetch(B + path, { method, headers: h, body: payload });
  const sc = r.headers.get("set-cookie"); if (sc && sc.startsWith("capsed_s=") && !sc.startsWith("capsed_s=;")) cookie = sc.split(";")[0];
  return { status: r.status, body: await r.json().catch(() => null) };
}
const change = (collection, data, extra = {}) => ({ changeId: uid(), collection, id: collection === "deliveries" ? `${data.invoiceId}@${data.declaredAt}` : data.id, data, base: 0, at: new Date().toISOString(), ...extra });
const push = (changes, auth = "web", gzip = false) => call("/api/sync", { method: "POST", body: { changes }, auth, gzip });

test("first Direction account, then setup is closed", async () => {
  assert.equal((await call("/api/setup")).body.needed, true);
  const r = await call("/api/setup", { method: "POST", body: { name: "La Direction", login: "direction", password: "secret1" }, headers: { "x-capsed": "1" } });
  assert.equal(r.status, 200); dirId = r.body.account.id;
  assert.ok(cookie);
  assert.equal((await call("/api/setup", { method: "POST", body: { name: "x", login: "x2", password: "secret1" }, headers: { "x-capsed": "1" } })).status, 409);
  assert.equal((await call("/api/me", { auth: "web" })).body.account.role, "responsable");
});

test("sign-in: wrong password refused, right one accepted, CSRF header required", async () => {
  assert.equal((await call("/api/login", { method: "POST", body: { login: "direction", password: "nope" }, headers: { "x-capsed": "1" } })).status, 401);
  assert.equal((await call("/api/login", { method: "POST", body: { login: "direction", password: "secret1" } })).status, 403);
  assert.equal((await call("/api/login", { method: "POST", body: { login: "DIRECTION", password: "secret1" }, headers: { "x-capsed": "1" } })).status, 200);
});

test("Direction creates team accounts; passwords never stored in clear", async () => {
  const r = await push([change("accounts", { ...awa, password: "CAP-1111", pwHash: "x", pwSalt: "AAAAAAAAAAAAAAAAAAAAAA==" }), change("accounts", paul)], "web", true);
  assert.ok(r.body.results.every(x => x.ok), JSON.stringify(r.body));
  assert.equal(r.body.results[0].record.password, undefined);
});

test("team member cannot sign in on the Direction site", async () => {
  const salt = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("CAP-2222"), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(salt, "base64"), iterations: 10000 }, key, 256);
  const r = await push([change("accounts", { ...paul, pwSalt: salt, pwIter: 10000, pwHash: Buffer.from(bits).toString("base64") })], "web");
  assert.ok(r.body.results[0].ok);
  const login = await call("/api/login", { method: "POST", body: { login: "paul", password: "CAP-2222" }, headers: { "x-capsed": "1" } });
  assert.equal(login.status, 403); assert.match(login.body.error, /réservé à la Direction/);
});

test("office computer: code, enrol, revoke-safe token", async () => {
  const c = await call("/api/devices/code", { method: "POST", body: {}, auth: "web" });
  assert.equal(c.status, 200); assert.equal(c.body.letter, "");
  assert.equal((await call("/api/devices/enroll", { method: "POST", body: { code: "000000", name: "x" } })).status, 400);
  const e = await call("/api/devices/enroll", { method: "POST", body: { code: c.body.code, name: "Facturation 1" } });
  assert.equal(e.status, 200); device = e.body.device; token = e.body.token;
  assert.equal((await call("/api/devices/enroll", { method: "POST", body: { code: c.body.code, name: "again" } })).status, 400, "a code works once");
  const c2 = await call("/api/devices/code", { method: "POST", body: {}, auth: "web" });
  assert.equal(c2.body.letter, "B", "second computer gets its own series");
});

let inv, pay, payRev = 0;
test("office pushes as the person signed in; the Direction on a computer works as the office", async () => {
  inv = { id: uid(), number: "2026-10-001", date: "2026-10-05", client: { id: "c1", name: "EFMK" }, lines: [{ id: "l", designation: "Désherbage", quantity: 1, unitPrice: 100000 }], taxRate: 0, taxMode: "ht", advance: 0, createdBy: awa.id };
  const r = await push([change("invoices", inv, { by: awa.id })], "device");
  assert.ok(r.body.results[0].ok, JSON.stringify(r.body));
  const asDir = await push([change("invoices", { ...inv, note: "x" }, { by: dirId })], "device");
  assert.ok(asDir.body.results[0].ok, "the Direction signed in on a computer does office work");
  const validate = await push([change("invoices", { ...inv, note: "x", validatedAt: "2026-10-05T10:00:00Z", validatedBy: dirId }, { by: dirId })], "device");
  assert.equal(validate.body.results[0].ok, false, "validating stays on the website");
  const settings = await push([change("settings", { id: "main", company: { name: "Autre" } }, { by: dirId })], "device");
  assert.equal(settings.body.results[0].ok, false, "the settings stay on the website");
  const account = await push([change("accounts", { ...awa, role: "bureau" }, { by: dirId })], "device");
  assert.equal(account.body.results[0].ok, false, "team accounts stay on the website");
  const wrongRole = await push([change("payments", { id: uid(), invoiceId: inv.id, amount: 1, date: "2026-10-05", method: "OM", reference: "" }, { by: awa.id })], "device");
  assert.equal(wrongRole.body.results[0].ok, false, "facturation cannot enter payments");
});

test("a send repeated after a cut changes nothing", async () => {
  pay = { id: uid(), invoiceId: inv.id, amount: 50000, date: "2026-10-05", method: "OM", reference: "MP1", by: paul.id };
  const ch = change("payments", pay, { by: paul.id });
  const a = await push([ch], "device"), b = await push([ch], "device");
  assert.ok(a.body.results[0].ok && b.body.results[0].ok && b.body.results[0].duplicate);
  assert.equal(a.body.results[0].rev, b.body.results[0].rev);
  payRev = a.body.results[0].rev;
});

test("team cannot validate; Direction validates; office correction made offline reopens validation", async () => {
  const self = await push([change("payments", { ...pay, lockedAt: "2026-10-05T10:00:00Z" }, { by: paul.id, base: payRev })], "device");
  assert.equal(self.body.results[0].ok, false);
  const lock = await push([change("payments", { ...pay, lockedAt: "2026-10-05T10:00:00Z" }, { base: payRev })], "web");
  assert.ok(lock.body.results[0].ok);
  // Paul corrected the amount offline, from the version before the lock.
  const late = await push([change("payments", { ...pay, amount: 60000 }, { by: paul.id, base: payRev })], "device");
  const rec = late.body.results[0].record;
  assert.ok(late.body.results[0].ok);
  assert.equal(rec.amount, 60000); assert.equal(rec.lockedAt, undefined); assert.ok(rec.changedAfterLock);
});

test("two people changing different fields both keep their work", async () => {
  const base = (await push([change("clients", { id: "c9", name: "Atlas", phone: "1" }, { by: awa.id })], "device")).body.results[0].rev;
  await push([change("clients", { id: "c9", name: "Atlas", phone: "2" }, { by: awa.id, base })], "device");
  const r = await push([change("clients", { id: "c9", name: "Atlas Commerce", phone: "1" }, { base })], "web");
  assert.equal(r.body.results[0].record.phone, "2"); assert.equal(r.body.results[0].record.name, "Atlas Commerce");
});

test("pull returns the latest state in order, with computer freshness", async () => {
  const r = await call("/api/sync?since=0&limit=3", { auth: "device" });
  assert.equal(r.body.records.length, 3); assert.equal(r.body.more, true);
  const all = await call(`/api/sync?since=${r.body.cursor}`, { auth: "device" });
  assert.equal(all.body.more, false);
  assert.ok(all.body.devices.some(d => d.name === "Facturation 1" && d.last_push));
});

test("only the Direction reopens a closed month or restores a cancelled payment", async () => {
  const s = await push([change("settings", { id: "main", closedMonths: ["2026-09"] }, { by: awa.id })], "device");
  assert.ok(s.body.results[0].ok, JSON.stringify(s.body));
  const reopen = await push([change("settings", { id: "main", closedMonths: [] }, { by: awa.id, base: s.body.results[0].rev })], "device");
  assert.equal(reopen.body.results[0].ok, false);
  assert.ok((await push([change("settings", { id: "main", closedMonths: [] }, { base: s.body.results[0].rev })], "web")).body.results[0].ok);
});

test("an office invoice that lands in a month already closed is kept and marked for the Direction", async () => {
  assert.ok((await push([change("settings", { id: "main", closedMonths: ["2026-08"] })], "web")).body.results[0].ok);
  const late = await push([change("invoices", { ...inv, id: uid(), number: "2026-08-007", date: "2026-08-20" }, { by: awa.id })], "device");
  assert.ok(late.body.results[0].ok, "kept, never refused");
  assert.ok(late.body.results[0].record.afterClose, "marked");
  const open = await push([change("invoices", { ...inv, id: uid(), number: "2026-10-008", date: "2026-10-02" }, { by: awa.id })], "device");
  assert.equal(open.body.results[0].record.afterClose, undefined, "an open month is not marked");
  const direction = await push([change("invoices", { ...inv, id: uid(), number: "2026-08-D001", date: "2026-08-21" })], "web");
  assert.equal(direction.body.results[0].record.afterClose, undefined, "the Direction may write in a closed month");
  assert.ok((await push([change("settings", { id: "main", closedMonths: [] })], "web")).body.results[0].ok);
});

test("the Direction can read a password again; office computers never receive it", async () => {
  const r = await push([change("accounts", { ...awa, email: "awa@capsed.cm", visiblePassword: "CAP-7777", pwHash: "x", pwSalt: "AAAAAAAAAAAAAAAAAAAAAA==" })], "web");
  assert.equal(r.body.results[0].record.visiblePassword, "CAP-7777");
  const web = await call("/api/sync?since=0", { auth: "web" }), dev = await call("/api/sync?since=0", { auth: "device" });
  assert.equal(web.body.records.find(x => x.id === awa.id).data.visiblePassword, "CAP-7777");
  const seen = dev.body.records.find(x => x.id === awa.id).data;
  assert.equal(seen.visiblePassword, undefined); assert.equal(seen.email, "awa@capsed.cm"); assert.ok(seen.pwHash);
});

test("only the Direction deletes; office computers get a stub; a payment made offline on it goes to the bin; restore brings it back", async () => {
  const bill = { id: uid(), number: "2026-10-007", date: "2026-10-06", client: { id: "c1", name: "EFMK" }, lines: [{ id: "l", designation: "Dératisation", quantity: 1, unitPrice: 80000 }], taxRate: 0, taxMode: "ht", advance: 0, createdBy: awa.id };
  const rev = (await push([change("invoices", bill, { by: awa.id })], "device")).body.results[0].rev;
  const at = new Date().toISOString();
  assert.equal((await push([change("invoices", { ...bill, deletedAt: at }, { by: awa.id, base: rev })], "device")).body.results[0].ok, false, "the team cannot delete");
  const del = await push([change("invoices", { ...bill, deletedAt: at, deletedBy: dirId, deleteReason: "saisie en double" }, { base: rev })], "web");
  assert.ok(del.body.results[0].ok); const delRev = del.body.results[0].rev;
  const office = (await call(`/api/sync?since=${rev}`, { auth: "device" })).body.records.find(r => r.id === bill.id).data;
  assert.deepEqual(Object.keys(office).sort(), ["date", "deletedAt", "id", "number"], "office computers only get a stub");
  const web = (await call(`/api/sync?since=${rev}`, { auth: "web" })).body.records.find(r => r.id === bill.id).data;
  assert.equal(web.deleteReason, "saisie en double"); assert.equal(web.lines.length, 1, "the Direction keeps it whole");
  const edit = await push([change("invoices", { ...bill, note: "x" }, { by: awa.id, base: rev })], "device");
  assert.equal(edit.body.results[0].ok, false, "a deleted invoice no longer changes from the office");
  const late = await push([change("payments", { id: uid(), invoiceId: bill.id, amount: 1000, date: "2026-10-06", method: "OM", reference: "", by: paul.id }, { by: paul.id })], "device");
  assert.ok(late.body.results[0].ok, "nothing is lost"); assert.ok(late.body.results[0].record.deletedAt, "but it lands in the bin with its invoice");
  const back = await push([change("invoices", bill, { base: delRev })], "web");
  assert.ok(back.body.results[0].ok); assert.equal(back.body.results[0].record.deletedAt, undefined); assert.equal(back.body.results[0].record.deleteReason, undefined);
  const again = (await call(`/api/sync?since=${delRev}`, { auth: "device" })).body.records.find(r => r.id === bill.id).data;
  assert.equal(again.lines.length, 1, "restored: whole again on office computers");
});

test("the Direction signed in on an office computer deletes there, but restores only on the website", async () => {
  const bill = { id: uid(), number: "2026-10-009", date: "2026-10-07", client: { id: "c1", name: "EFMK" }, lines: [{ id: "l", designation: "Fumigation", quantity: 1, unitPrice: 40000 }], taxRate: 0, taxMode: "ht", advance: 0, createdBy: awa.id, validatedAt: "2026-10-07T09:00:00Z", validatedBy: dirId };
  const rev = (await push([change("invoices", bill)], "web")).body.results[0].rev;
  const at = new Date().toISOString();
  const forged = await push([change("invoices", { ...bill, deletedAt: at, deletedBy: awa.id, deleteReason: "x" }, { by: dirId, base: rev })], "device");
  assert.equal(forged.body.results[0].ok, false, "a deletion is signed by who deletes");
  const sneaky = await push([change("invoices", { ...bill, note: "changé", deletedAt: at, deletedBy: dirId, deleteReason: "x" }, { by: awa.id, base: rev })], "device");
  assert.equal(sneaky.body.results[0].ok, false, "the team still cannot delete");
  const del = await push([change("invoices", { ...bill, deletedAt: at, deletedBy: dirId, deleteReason: "erreur de client" }, { by: dirId, base: rev })], "device");
  assert.ok(del.body.results[0].ok, JSON.stringify(del.body)); assert.deepEqual(Object.keys(del.body.results[0].record).sort(), ["date", "deletedAt", "id", "number"]);
  const web = (await call(`/api/sync?since=${rev}`, { auth: "web" })).body.records.find(r => r.id === bill.id).data;
  assert.equal(web.deleteReason, "erreur de client"); assert.equal(web.validatedAt, bill.validatedAt, "its validation is kept for a restore");
  const restore = await push([change("invoices", bill, { by: dirId, base: del.body.results[0].rev })], "device");
  assert.equal(restore.body.results[0].ok, false, "restoring stays on the website");
});

test("revoked computer is refused", async () => {
  assert.ok((await call("/api/devices/revoke", { method: "POST", body: { id: device.id }, auth: "web" })).body.ok);
  assert.equal((await call("/api/sync", { auth: "device" })).status, 401);
});

test("recovery link: wrong key is 404, right key resets the Direction password", async () => {
  assert.equal((await fetch(B + "/secours/wrong-key-wrong-key-wrong-key")).status, 404);
  const page = await (await fetch(B + "/secours/test-recovery-key-0123456789abcdef")).text();
  assert.match(page, /Nouveau mot de passe Direction/);
  const form = new URLSearchParams({ account: dirId, password: "nouveau9" });
  const done = await fetch(B + "/secours/test-recovery-key-0123456789abcdef", { method: "POST", body: form });
  assert.equal(done.status, 200);
  assert.equal((await call("/api/login", { method: "POST", body: { login: "direction", password: "secret1" }, headers: { "x-capsed": "1" } })).status, 401);
  assert.equal((await call("/api/login", { method: "POST", body: { login: "direction", password: "nouveau9" }, headers: { "x-capsed": "1" } })).status, 200);
});

test("the Direction sees its connections and signs out every other device", async () => {
  const login = async ua => { const r = await fetch(B + "/api/login", { method: "POST", headers: { "content-type": "application/json", "x-capsed": "1", "user-agent": ua }, body: JSON.stringify({ login: "direction", password: "nouveau9" }) }); return r.headers.get("set-cookie").split(";")[0]; };
  const phone = await login("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36");
  const laptop = await login("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0");
  const get = (c, path, init = {}) => fetch(B + path, { ...init, headers: { cookie: c, "x-capsed": "1", "content-type": "application/json", ...(init.headers ?? {}) } });
  const list = await (await get(laptop, "/api/sessions")).json();
  assert.ok(list.sessions.some(x => x.label === "Android · Chrome"));
  assert.equal(list.sessions.filter(x => x.current).length, 1);
  assert.equal(list.sessions.find(x => x.current).label, "Windows · Edge");
  const out = await (await get(laptop, "/api/sessions/others", { method: "POST", body: "{}" })).json();
  assert.ok(out.signedOut >= 1);
  assert.equal((await get(phone, "/api/me")).status, 401, "the phone is signed out");
  assert.equal((await get(laptop, "/api/me")).status, 200, "this device stays signed in");
  cookie = laptop; // the other tests go on with the connection that stayed
  assert.equal((await get(laptop, "/api/sessions/others", { method: "POST", body: "{}", headers: { "x-capsed": "" } })).status, 403, "protected against cross-site requests");
});

test("too many wrong passwords are slowed down", async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await call("/api/login", { method: "POST", body: { login: "paul", password: "x" }, headers: { "x-capsed": "1" } });
  assert.equal(last.status, 429);
});

test("a computer whose enrolment reply was lost can retry with the same attempt, nobody else can", async () => {
  const c = await call("/api/devices/code", { method: "POST", body: {}, auth: "web" });
  const attempt = "attempt-" + uid().replace(/[^a-z0-9]/gi, "").slice(0, 20);
  const first = await call("/api/devices/enroll", { method: "POST", body: { code: c.body.code, name: "Encaissement", attempt } });
  assert.equal(first.status, 200);
  const again = await call("/api/devices/enroll", { method: "POST", body: { code: c.body.code, name: "Encaissement", attempt } });
  assert.equal(again.status, 200); assert.equal(again.body.device.id, first.body.device.id, "same computer, not a second one");
  assert.notEqual(again.body.token, first.body.token);
  assert.equal((await call("/api/sync?since=0&limit=1", { headers: { authorization: "Bearer " + first.body.token } })).status, 401, "the lost token no longer works");
  assert.equal((await call("/api/sync?since=0&limit=1", { headers: { authorization: "Bearer " + again.body.token } })).status, 200);
  assert.equal((await call("/api/devices/enroll", { method: "POST", body: { code: c.body.code, name: "Autre", attempt: "attempt-someone-else-000" } })).status, 400, "another computer cannot reuse the code");
  const { body } = await call("/api/devices", { auth: "web" });
  assert.equal(body.devices.filter(d => d.name === "Encaissement").length, 1);
});
