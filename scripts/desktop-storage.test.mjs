import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const folder = new URL('../.sites-runtime/tests/', import.meta.url);
await mkdir(folder, { recursive: true });
const result = await build({ entryPoints: ['app/v2/local-storage.ts'], bundle: true, format: 'esm', write: false, define: { __CAPSED_MODE__: '"office"' } });
await writeFile(new URL('storage.mjs', folder), result.outputFiles[0].text);
let sequence = 0;
async function storage(initial = {}) {
  const records = new Map(Object.entries(initial));
  globalThis.localStorage = { getItem: k => records.get(k) ?? null, setItem: (k, v) => records.set(k, v), removeItem: k => records.delete(k) };
  const api = await import(new URL(`storage.mjs?test=${sequence++}`, folder));
  return { records, ...api };
}
test('missing record boots with defaults without reporting damage', async () => {
  const s = await storage();
  assert.deepEqual(s.readLocal('missing', [], s.recordList), []);
  assert.equal(s.hasLocalDamage(), false);
});
test('malformed records boot with defaults and cannot be overwritten before backup', async () => {
  for (const raw of ['{invalid', 'null', '{}', '[null]']) {
    const s = await storage({ 'capsed-office-data': raw });
    assert.deepEqual(s.readLocal('capsed-office-data', [], s.recordList), []);
    assert.equal(s.hasLocalDamage(), true);
    assert.equal(s.records.get('capsed-office-data'), raw);
    assert.throws(() => s.writeLocal('capsed-office-data', []), /STORAGE_RECOVERY_REQUIRED/);
  }
});
test('repair saves exact originals, retains a review warning across reload, and exports no credentials', async () => {
  const s = await storage({ 'capsed-office-data': '{invalid', 'capsed-office-device': '{credential' });
  s.readLocal('capsed-office-data', [], s.recordList);
  s.readLocal('capsed-office-device', [], s.recordList);
  s.prepareLocalRepair();
  for (const issue of s.getLocalHealth()) assert.equal(s.records.get(issue.backupKey), s.records.get(issue.key));
  s.writeLocal('capsed-office-data', []);
  s.completeLocalRepair();
  assert.equal(s.hasLocalDamage(), false);
  assert.equal(s.recoveryExport().length, 1);
  assert.equal(s.recoveryExport()[0].raw, '{invalid');
  const loaded = await import(new URL(`storage.mjs?reload=${sequence++}`, folder));
  assert.equal(loaded.hasLocalDamage(), false);
  assert.ok(loaded.getLocalHealth().some(v => v.backupKey && v.resolved));
});
test('failed backup aborts repair and leaves the original protected', async () => {
  const s = await storage({ 'capsed-office-data': '{invalid' });
  s.readLocal('capsed-office-data', [], s.recordList);
  globalThis.localStorage.setItem = () => { throw Error('quota'); };
  assert.throws(() => s.prepareLocalRepair(), /quota/);
  assert.equal(s.records.get('capsed-office-data'), '{invalid');
  assert.throws(() => s.writeLocal('capsed-office-data', []), /STORAGE_RECOVERY_REQUIRED/);
});
test('valid unsent queue is backed up without being removed or changed', async () => {
  const raw = JSON.stringify([{ changeId: 'pending', data: { id: 'invoice-one' } }]);
  const s = await storage({ 'capsed-office-sync-outbox': raw });
  s.prepareLocalRepair(['capsed-office-sync-outbox']);
  assert.equal(s.records.get('capsed-office-sync-outbox'), raw);
  assert.equal(s.recoveryExport()[0].raw, raw);
});
test('storage access denial still permits boot, but prevents unsafe repair', async () => {
  const s = await storage();
  globalThis.localStorage.getItem = () => { throw Error('denied'); };
  assert.deepEqual(s.readLocal('data', [], s.recordList), []);
  assert.equal(s.hasLocalDamage(), true);
  assert.throws(() => s.prepareLocalRepair(), /denied/);
});
const healthBuild = await build({ entryPoints: ['app/v2/document-health.ts'], bundle: true, format: 'esm', write: false });
await writeFile(new URL('health.mjs', folder), healthBuild.outputFiles[0].text);
const { documentIssues } = await import(new URL('health.mjs', folder));
test('missing document snapshots are reported without modifying documents', () => {
  const good = { id: 'one', number: 'TEST', date: '2026-10-29', lines: [], client: { id: 'c', name: 'Client' }, company: { name: 'CAPSED' } };
  assert.deepEqual(documentIssues({ invoices: [good], credits: [] }), []);
  const raw = { invoices: [{ number: 'TEST-1' }], credits: [{ id: 'credit', client: null }] };
  assert.ok(documentIssues(raw).length >= 2);
  assert.match(documentIssues(raw)[0], /TEST-1/);
  assert.equal(raw.invoices[0].client, undefined);
});
const syncBuild = await build({ entryPoints: ['app/v2/sync.ts'], bundle: true, platform: 'node', format: 'esm', write: false, define: { __CAPSED_MODE__: '"office"' } });
await writeFile(new URL('sync.mjs', folder), syncBuild.outputFiles[0].text);
test('full repair survives corrupt data and outbox and retains both original values', async () => {
  const s = await storage({ 'capsed-office-data': '{invalid', 'capsed-office-sync-outbox': 'null' });
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window, oldDocument = globalThis.document;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  globalThis.window = { addEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {} };
  const sync = await import(new URL(`sync.mjs?test=${sequence++}`, folder));
  globalThis.fetch = async () => new Response(JSON.stringify({ records: [], cursor: 4, more: false, devices: [] }), { headers: { 'content-type': 'application/json' } });
  try {
    sync.startSync({ api: 'https://test.invalid', token: 'test', by: () => 'a' });
    await new Promise(r => setTimeout(r, 0));
    await sync.recoverSync();
    assert.equal(sync.getSync().error, undefined);
    assert.equal(s.records.get('capsed-office-data').startsWith('{'), true);
    assert.doesNotThrow(() => JSON.parse(s.records.get('capsed-office-data')));
    assert.deepEqual(JSON.parse(s.records.get('capsed-office-sync-outbox')), []);
    const backups = JSON.parse(s.records.get('capsed-office-recovery-index'));
    assert.ok(backups.some(v => s.records.get(v.backupKey) === '{invalid'));
    assert.ok(backups.some(v => s.records.get(v.backupKey) === 'null'));
    assert.ok(backups.every(v => v.resolved));
  } finally {
    sync.stopSync(); globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.document = oldDocument;
  }
});
test('rebuild is staged, keeps acknowledged work, and archives local-only records', async () => {
  const account = { id: 'a', name: 'Test', login: 'a', role: 'bureau', active: true };
  const pending = { id: 'new', name: 'Pending client' };
  const original = JSON.stringify({ version: 2, accounts: [account], clients: [{ id: 'orphan', name: 'Local only' }, pending] });
  const queue = JSON.stringify([{ changeId: 'pending', collection: 'clients', id: 'new', base: 0, at: '2026-10-29T00:00:00Z', by: 'a', data: pending }]);
  const s = await storage({ 'capsed-office-data': original, 'capsed-office-sync-outbox': queue });
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window, oldDocument = globalThis.document;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  globalThis.window = { addEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {} };
  const sync = await import(new URL(`sync.mjs?test=${sequence++}`, folder));
  const reply = x => new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async () => { throw Error('offline'); };
  let accepted = false;
  try {
    sync.startSync({ api: 'https://test.invalid', token: 'test', by: () => 'a' });
    await new Promise(r => setTimeout(r, 0));
    globalThis.fetch = async (url, init) => {
      if (init.method === 'POST') { accepted = true; return reply({ results: [{ changeId: 'pending', ok: true, rev: 1, record: pending }] }); }
      if (url.includes('since=0')) return reply({ records: [{ collection: 'accounts', id: 'a', rev: 1, data: account }], cursor: 1, more: true, devices: [] });
      throw Error('connection lost on page two');
    };
    await sync.recoverSync();
    assert.equal(accepted, true);
    assert.equal(s.records.get('capsed-office-data'), original, 'partial server snapshot must not replace local data');
    assert.deepEqual(JSON.parse(s.records.get('capsed-office-sync-outbox')), []);
    assert.ok(sync.getSync().error);
    globalThis.fetch = async () => reply({ records: [{ collection: 'accounts', id: 'a', rev: 1, data: account }, { collection: 'clients', id: 'new', rev: 1, data: pending }], cursor: 2, more: false, devices: [] });
    await sync.recoverSync();
    assert.equal(sync.getSync().error, undefined);
    assert.deepEqual(JSON.parse(s.records.get('capsed-office-data')).clients, [pending]);
    const backups = JSON.parse(s.records.get('capsed-office-recovery-index'));
    assert.ok(backups.some(v => v.code === 'LOCAL_RECORDS_ARCHIVED' && s.records.get(v.backupKey) === original));
    assert.ok(backups.some(v => s.records.get(v.backupKey) === queue));
  } finally { sync.stopSync(); globalThis.fetch = oldFetch; globalThis.window = oldWindow; globalThis.document = oldDocument; }
});
