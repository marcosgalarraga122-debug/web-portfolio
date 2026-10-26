/* Small shared helpers: responses, request parsing, hashing, origin checks */

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// Parse a JSON body, refusing anything larger than `max` bytes
export async function readJson(request, max = 4096) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > max) throw new HttpError(413, "too_large");
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "too_large");
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new HttpError(400, "invalid_json"); }
}

export const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);
export const int = (v, fallback) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback);

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
async function hmacRaw(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
}
export const hmac = async (secret, text) => hex(await hmacRaw(secret, text));

// Compare two strings in constant time (both are first reduced to fixed-length MACs)
export async function safeEqual(secret, a, b) {
  const [x, y] = await Promise.all([hmacRaw(secret, String(a)), hmacRaw(secret, String(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

// A key for rate limiting: the visitor's IP address, keyed with a secret that changes every
// day, so it can't be reversed or linked across days. It is never stored.
export async function clientKey(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return (await hmac(`${env.HASH_SECRET}:${dayOf(Date.now())}`, ip)).slice(0, 32);
}

export function allowedOrigins(env) {
  return [env.SITE_ORIGIN, ...String(env.DEV_ORIGINS || "").split(",")].map((s) => s.trim()).filter(Boolean);
}

export const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
export const isToken = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
export const isVisitorId = (s) => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);

export const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
