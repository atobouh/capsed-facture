import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const folder = new URL('../.sites-runtime/tests/', import.meta.url);
await mkdir(folder, { recursive: true });
const result = await build({ entryPoints: ['app/v2/local-storage.ts'], bundle: true, format: 'esm', write: false });
await writeFile(new URL('storage.mjs', folder), result.outputFiles[0].text);
const { readLocal, writeLocal, recordList } = await import(new URL('storage.mjs', folder));
let records = new Map();
globalThis.localStorage = { getItem: k => records.get(k) ?? null, setItem: (k, v) => records.set(k, v) };
test('missing record uses its default', () => assert.deepEqual(readLocal('missing', [], recordList), []));
test('bad JSON and invalid collections are preserved and reported', () => {
  for (const raw of ['{invalid', 'null', '{}', '[null]']) {
    records.set('data', raw);
    assert.throws(() => readLocal('data', [], recordList), /STORAGE_(JSON|SCHEMA)/);
    assert.equal(records.get('data'), raw);
  }
});
test('valid records survive a write and read', () => {
  writeLocal('ok', [{ id: 'one' }]);
  assert.deepEqual(readLocal('ok', [], recordList), [{ id: 'one' }]);
});
test('quota and access errors are visible', () => {
  const storage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  try {
    assert.throws(() => readLocal('data', [], recordList), /STORAGE_ACCESS/);
    assert.throws(() => writeLocal('data', []), /STORAGE_WRITE/);
  } finally { globalThis.localStorage = storage; }
});

const healthBuild = await build({ entryPoints: ['app/v2/document-health.ts'], bundle: true, format: 'esm', write: false });
await writeFile(new URL('health.mjs', folder), healthBuild.outputFiles[0].text);
const { documentIssues } = await import(new URL('health.mjs', folder));
test('missing invoice and credit client snapshots are identified before rendering', () => {
  assert.deepEqual(documentIssues({ invoices: [{ id: 'one', number: 'TEST', date: '2026-10-29', lines: [], client: { id: 'c', name: 'Client' }, company: { name: 'CAPSED' } }], credits: [] }), []);
  const raw = { invoices: [{ number: 'TEST-1' }], credits: [{ id: 'credit', client: null }] };
  assert.ok(documentIssues(raw).length >= 2);
  assert.match(documentIssues(raw)[0], /TEST-1/);
  assert.equal(raw.invoices[0].client, undefined);
});
