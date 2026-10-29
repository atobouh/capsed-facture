/** Local records must be checked at runtime: TypeScript casts do not validate JSON. */
export function readLocal<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { throw new Error('STORAGE_ACCESS : stockage local inaccessible. Vérifiez les autorisations du poste ; ne supprimez pas les données.'); }
  if (raw === null) return fallback;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('STORAGE_JSON : données locales illisibles. Contactez l’assistance pour une récupération ; les données sont conservées.'); }
  if (!valid(value)) throw new Error('STORAGE_SCHEMA : données locales incompatibles. Contactez l’assistance pour une récupération ; les données sont conservées.');
  return value;
}
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {
    throw new Error('STORAGE_WRITE : enregistrement local impossible (espace disque, quota ou autorisations). Arrêtez la saisie et contactez l’assistance.');
  }
}
export const objectRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const recordList = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(objectRecord);
