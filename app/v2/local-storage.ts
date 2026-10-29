/** Invalid records are kept verbatim; the UI can boot and explicitly repair them. */
export type LocalIssue = { key: string; code: string; backupKey?: string; resolved?: boolean; prepared?: boolean };
declare const __CAPSED_MODE__: string | undefined;
const PREFIX = typeof __CAPSED_MODE__ === 'string' ? `capsed-${__CAPSED_MODE__}-recovery` : 'capsed-recovery';
const INDEX = PREFIX + '-index';
let initialized = false;
let issues: readonly LocalIssue[] = [];
const listeners = new Set<() => void>();
function publish(next: readonly LocalIssue[]) {
  issues = next;
  Promise.resolve().then(() => listeners.forEach(f => f()));
}
function init() {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(INDEX);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every(v => v && typeof v.key === 'string' && typeof v.code === 'string' && (v.backupKey === undefined || typeof v.backupKey === 'string'))) issues = parsed;
      else issues = [{ key: INDEX, code: 'STORAGE_SCHEMA' }];
    }
  } catch { issues = [{ key: INDEX, code: 'STORAGE_ACCESS' }]; }
}
function report(key: string, code: string) {
  init();
  const previous = issues.find(v => v.key === key && !v.resolved);
  if (!previous) publish([...issues, { key, code }]);
}
export const subscribeLocalHealth = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export function getLocalHealth() { init(); return issues; }
export function hasLocalDamage() { return getLocalHealth().some(v => !v.resolved); }
export function readRawLocal(key: string): string {
  init();
  try { return localStorage.getItem(key) ?? ''; } catch { report(key, 'STORAGE_ACCESS'); return ''; }
}
export function readLocal<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  const raw = readRawLocal(key);
  if (!raw) return fallback;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { report(key, 'STORAGE_JSON'); return fallback; }
  if (!valid(value)) { report(key, 'STORAGE_SCHEMA'); return fallback; }
  return value;
}
/** Copy every damaged value before allowing repair to overwrite its original key. */
export function prepareLocalRepair(preserveKeys: string[] = []) {
  init();
  const source = [...issues];
  for (const key of preserveKeys) if (!source.some(v => v.key === key && !v.resolved) && localStorage.getItem(key) !== null) source.push({ key, code: 'REPAIR_SNAPSHOT', resolved: true });
  const next = source.map(issue => {
    if (issue.prepared || issue.backupKey || (issue.resolved && issue.code !== 'REPAIR_SNAPSHOT')) return issue;
    const raw = localStorage.getItem(issue.key); // Access failure must stop repair.
    if (raw === null) return { ...issue, prepared: true };
    let key = '', sequence = 0;
    do { key = `${PREFIX}-backup-${Date.now()}-${sequence++}`; } while (localStorage.getItem(key) !== null);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('La copie de sécurité locale n’a pas pu être vérifiée.');
    return { ...issue, backupKey: key, prepared: true };
  });
  localStorage.setItem(INDEX, JSON.stringify(next));
  publish(next);
}
/** Server-only rebuilds archive local records absent from the authoritative copy. */
export function markRepairArchivesForReview(key: string) {
  const next = getLocalHealth().map(v => v.key === key && v.code === 'REPAIR_SNAPSHOT' ? { ...v, code: 'LOCAL_RECORDS_ARCHIVED' } : v);
  localStorage.setItem(INDEX, JSON.stringify(next));
  publish(next);
}
export function completeLocalRepair() {
  const next = getLocalHealth().map(v => ({ ...v, resolved: true }));
  localStorage.setItem(INDEX, JSON.stringify(next));
  publish(next);
}
export function writeRawLocal(key: string, raw: string | null) {
  const damaged = getLocalHealth().find(v => v.key === key && !v.resolved);
  if (damaged && !damaged.prepared && !damaged.backupKey) throw new Error('STORAGE_RECOVERY_REQUIRED : sauvegardez les données locales avant la réparation.');
  try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); } catch {
    report(key, 'STORAGE_WRITE');
    throw new Error('STORAGE_WRITE : enregistrement local impossible. Vérifiez l’espace disque et les autorisations.');
  }
}
export function writeLocal(key: string, value: unknown) { writeRawLocal(key, JSON.stringify(value)); }
/** User-requested download: financial and sync backups only, never device credentials. */
export function recoveryExport() {
  return getLocalHealth().filter(v => v.backupKey && /-(data|sync-outbox)$/.test(v.key)).map(v => ({ key: v.key, code: v.code, raw: localStorage.getItem(v.backupKey!) }));
}
export const objectRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const recordList = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(objectRecord);
