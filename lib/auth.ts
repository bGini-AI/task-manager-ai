// Web-crypto based session cookie, usable from both the proxy and route handlers.
export const SESSION_COOKIE = "tm_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function secret(): string {
  return process.env.SESSION_SECRET || `tm::${process.env.APP_PASSWORD ?? ""}`;
}

const enc = new TextEncoder();

function toB64Url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toB64Url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = String(exp);
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.APP_PASSWORD) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, await hmac(payload))) return false;
  return Number(payload) > Math.floor(Date.now() / 1000);
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // compare digests so length differences don't leak
  const [a, b] = await Promise.all([hmac("pw:" + input), hmac("pw:" + expected)]);
  return safeEqual(a, b);
}

export const SESSION_MAX_AGE = MAX_AGE_SEC;
