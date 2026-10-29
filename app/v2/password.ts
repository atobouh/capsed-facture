/** Password hashing shared by the cloud API and the office app (offline sign-in). PBKDF2-SHA256 via WebCrypto.
 *  The iteration count stays modest so a sign-in fits the Workers free-plan CPU budget; sign-in attempts are rate limited. */
export const PW_ITER = 10000;
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function randomSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }
export async function hashPassword(password: string, salt: string, iter = PW_ITER) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: iter }, key, 256);
  return b64(new Uint8Array(bits));
}
export async function makeHash(password: string) { const pwSalt = randomSalt(); return { pwSalt, pwIter: PW_ITER, pwHash: await hashPassword(password, pwSalt) }; }
/** Constant-time comparison of two base64 strings. */
export function sameString(a: string, b: string) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
export async function checkPassword(password: string, rec: { pwHash?: string; pwSalt?: string; pwIter?: number }) {
  if (!rec.pwHash || !rec.pwSalt) return false;
  return sameString(await hashPassword(password, rec.pwSalt, rec.pwIter ?? PW_ITER), rec.pwHash);
}
