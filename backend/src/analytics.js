/* POST /api/event — privacy-conscious visit analytics.
   The website only sends these after the visitor accepts analytics in the cookie banner.
   Stored: event type, time, page path, referring domain, device category (desktop, tablet or
   mobile), site language and a random visitor ID kept in that browser. Not stored: IP
   addresses, user agents, precise location, or anything that identifies a person. */
import { LANGS } from "./text.js";
import { HttpError, readJson, clientKey, isVisitorId, dayOf } from "./util.js";

const TYPES = ["pageview", "chat_open", "chat_message", "contact_click"];
const DEVICES = ["desktop", "tablet", "mobile"];
const CONTACT_DETAILS = ["email_link", "email_copy", "contact_form", "chat_email", "chat_form", "chat_draft", "cv_download"];

const cleanPath = (p) => (typeof p === "string" ? p.split(/[?#]/)[0].slice(0, 160) || "/" : null);
function cleanReferrer(r, env) {
  if (typeof r !== "string" || !r) return null;
  try {
    const host = new URL(r).hostname.toLowerCase();
    return host && host !== new URL(env.SITE_ORIGIN).hostname ? host.slice(0, 100) : null;
  } catch { return null; }
}

export async function handleEvent(request, env) {
  const body = await readJson(request, 2048);
  if (!TYPES.includes(body.type)) throw new HttpError(400, "invalid_type");
  if (!isVisitorId(body.visitorId)) throw new HttpError(400, "invalid_visitor");
  if (env.EVENT_LIMIT) {
    const { success } = await env.EVENT_LIMIT.limit({ key: await clientKey(request, env) });
    if (!success) throw new HttpError(429, "rate_limited");
  }
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO events (ts, day, type, visitor_id, path, referrer, device, lang, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
  ).bind(
    now, dayOf(now), body.type, body.visitorId,
    cleanPath(body.path),
    body.type === "pageview" ? cleanReferrer(body.referrer, env) : null,
    DEVICES.includes(body.device) ? body.device : null,
    LANGS.includes(body.lang) ? body.lang : null,
    body.type === "contact_click" && CONTACT_DETAILS.includes(body.detail) ? body.detail : null,
  ).run();
  return new Response(null, { status: 204 });
}
