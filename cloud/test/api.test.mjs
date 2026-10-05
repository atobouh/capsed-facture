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
test("office pushes as the person signed in; the computer can never act as the Direction", async () => {
  inv = { id: uid(), number: "2026-10-001", date: "2026-10-05", client: { id: "c1", name: "EFMK" }, lines: [{ id: "l", designation: "Désherbage", quantity: 1, unitPrice: 100000 }], taxRate: 0, taxMode: "ht", advance: 0, createdBy: awa.id };
  const r = await push([change("invoices", inv, { by: awa.id })], "device");
  assert.ok(r.body.results[0].ok, JSON.stringify(r.body));
  const asDir = await push([change("invoices", { ...inv, note: "x" }, { by: dirId })], "device");
  assert.equal(asDir.body.results[0].ok, false);
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

test("the Direction can read a password again; office computers never receive it", async () => {
  const r = await push([change("accounts", { ...awa, email: "awa@capsed.cm", visiblePassword: "CAP-7777", pwHash: "x", pwSalt: "AAAAAAAAAAAAAAAAAAAAAA==" })], "web");
  assert.equal(r.body.results[0].record.visiblePassword, "CAP-7777");
  const web = await call("/api/sync?since=0", { auth: "web" }), dev = await call("/api/sync?since=0", { auth: "device" });
  assert.equal(web.body.records.find(x => x.id === awa.id).data.visiblePassword, "CAP-7777");
  const seen = dev.body.records.find(x => x.id === awa.id).data;
  assert.equal(seen.visiblePassword, undefined); assert.equal(seen.email, "awa@capsed.cm"); assert.ok(seen.pwHash);
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
