/* Marcos's AI Assistant: Cloudflare Worker entry point.
   Public API (called by the portfolio site, CORS-limited to its origin):
     POST /api/chat           a visitor message → an assistant reply
     POST /api/chat/contact   the visitor used a contact option in the chat
     POST /api/event          analytics event (only sent after consent)
   Private owner dashboard (same origin, session cookie):
     GET  /admin              the dashboard page
     *    /admin/api/*        its API (see admin.js) */
import { handleChat, handleChatContact } from "./chat.js";
import { handleEvent } from "./analytics.js";
import { handleAdminApi, retention } from "./admin.js";
import ADMIN_HTML from "./admin-ui/index.html";
import ADMIN_CSS from "./admin-ui/app.css";
import ADMIN_JS from "./admin-ui/app.client.js";
import { HttpError, json, allowedOrigins } from "./util.js";

const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
};
const ADMIN_CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "connect-src 'self'", "img-src 'self' data:", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

function withHeaders(res, extra) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY, ...extra })) r.headers.set(k, v);
  return r;
}

const asset = (body, type) => new Response(body, { headers: { "content-type": type, "cache-control": "no-store" } });

async function route(request, env, url) {
  const path = url.pathname;

  if (path.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const allowed = allowedOrigins(env).includes(origin);
    const cors = allowed ? { "access-control-allow-origin": origin, vary: "Origin" } : { vary: "Origin" };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowed ? 204 : 403, headers: { ...cors, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
    }
    // Only the portfolio site may call the public API from a browser
    if (!allowed) return json({ error: "forbidden_origin" }, 403, cors);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    try {
      let res;
      if (path === "/api/chat") res = await handleChat(request, env);
      else if (path === "/api/chat/contact") res = await handleChatContact(request, env);
      else if (path === "/api/event") res = await handleEvent(request, env);
      else throw new HttpError(404, "not_found");
      return withHeaders(res, cors);
    } catch (e) {
      return errorResponse(e, cors);
    }
  }

  if (path === "/admin" || path === "/admin/") {
    return withHeaders(asset(ADMIN_HTML, "text/html; charset=utf-8"), { "content-security-policy": ADMIN_CSP, "x-frame-options": "DENY", "x-robots-tag": "noindex, nofollow" });
  }
  if (path === "/admin/app.js") return withHeaders(asset(ADMIN_JS, "text/javascript; charset=utf-8"), {});
  if (path === "/admin/app.css") return withHeaders(asset(ADMIN_CSS, "text/css; charset=utf-8"), {});
  if (path.startsWith("/admin/api/")) {
    try { return withHeaders(await handleAdminApi(request, env, url), { "x-robots-tag": "noindex" }); }
    catch (e) { return errorResponse(e, {}); }
  }
  if (path === "/robots.txt") return asset("User-agent: *\nDisallow: /\n", "text/plain");
  if (path === "/") return Response.redirect(env.SITE_URL, 302);
  return json({ error: "not_found" }, 404);
}

function errorResponse(e, headers) {
  if (e instanceof HttpError) return withHeaders(json({ error: e.code }, e.status), headers);
  console.log("error", String(e && e.stack || e).slice(0, 300));
  return withHeaders(json({ error: "server_error" }, 500), headers);
}

export default {
  async fetch(request, env) {
    return route(request, env, new URL(request.url));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(retention(env));
  },
};
