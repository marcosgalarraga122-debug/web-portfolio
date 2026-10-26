/* The private owner dashboard's API (/admin/api/*). Every route except login requires a valid
   session; sessions live in D1 and the browser only holds an HttpOnly, Secure, SameSite=Strict
   cookie. The password is a Worker secret (ADMIN_PASSWORD) and never reaches the browser. */
import { HttpError, json, readJson, randomToken, sha256, safeEqual, clientKey, hashSecret, underLimits, dayOf, int, isUuid } from "./util.js";
import { runModel } from "./chat.js";
import { LANGS } from "./text.js";

const COOKIE = "__Host-mas_session";
const SESSION_HOURS = 12;
const MAX_LOGIN_FAILURES_PER_DAY = 200; // across all visitors; after this, logins pause until midnight UTC

const cookieOf = (request) => {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})`));
  return m ? m[1] : null;
};

export async function requireSession(request, env) {
  const token = cookieOf(request);
  if (!token) throw new HttpError(401, "unauthorized");
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).first();
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, "unauthorized");
}

// State-changing requests must come from the dashboard page itself
export function requireSameOrigin(request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new HttpError(403, "bad_origin");
}

async function login(request, env) {
  const key = await clientKey(request, env);
  if (env.LOGIN_LIMIT && !(await env.LOGIN_LIMIT.limit({ key })).success) throw new HttpError(429, "rate_limited");
  if (!(await underLimits(env, key, [["login-min", 5, 60], ["login-day", 50, 86400]]))) throw new HttpError(429, "rate_limited");
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) throw new HttpError(503, "not_configured");
  const day = dayOf(Date.now());
  const usage = await env.DB.prepare("SELECT login_failures FROM usage WHERE day = ?1").bind(day).first();
  if (usage && usage.login_failures >= MAX_LOGIN_FAILURES_PER_DAY) throw new HttpError(429, "locked");
  const body = await readJson(request, 1024);
  const ok = typeof body.password === "string" && (await safeEqual(await hashSecret(env), body.password, env.ADMIN_PASSWORD));
  if (!ok) {
    await env.DB.prepare("INSERT INTO usage (day, login_failures) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET login_failures = login_failures + 1").bind(day).run();
    throw new HttpError(401, "wrong_password");
  }
  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now),
    env.DB.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?1, ?2, ?3)").bind(await sha256(token), now, now + SESSION_HOURS * 3600e3),
  ]);
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}` });
}

async function logout(request, env) {
  const token = cookieOf(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` });
}

// ?from=&to= (ms since epoch) and ?tz= (minutes east of UTC, for grouping by local day)
function range(url) {
  const now = Date.now();
  const to = int(url.searchParams.get("to"), now);
  const from = int(url.searchParams.get("from"), to - 30 * 864e5);
  if (from > to || to - from > 3 * 366 * 864e5) throw new HttpError(400, "invalid_range");
  const tz = Math.max(-840, Math.min(840, int(url.searchParams.get("tz"), 0)));
  return { from, to, tzs: tz * 60 };
}

async function overview(url, env) {
  const { from, to, tzs } = range(url);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const day = (col) => `strftime('%Y-%m-%d', ${col} / 1000 + ?3, 'unixepoch')`;
  const [totals, visitsByDay, chatsByDay, langs, topics, questions, pages, referrers, devices, contacts, recent, usage] = await env.DB.batch([
    q(`SELECT
        (SELECT COUNT(*) FROM events WHERE type = 'pageview' AND ts BETWEEN ?1 AND ?2) AS visits,
        (SELECT COUNT(DISTINCT visitor_id) FROM events WHERE type = 'pageview' AND ts BETWEEN ?1 AND ?2) AS visitors,
        (SELECT COUNT(DISTINCT visitor_id) FROM events WHERE type = 'chat_open' AND ts BETWEEN ?1 AND ?2) AS chatOpeners,
        (SELECT COUNT(*) FROM events WHERE type = 'contact_click' AND ts BETWEEN ?1 AND ?2) AS contactClicks,
        (SELECT COUNT(*) FROM conversations WHERE created_at BETWEEN ?1 AND ?2) AS conversations,
        (SELECT COUNT(*) FROM messages WHERE role = 'user' AND created_at BETWEEN ?1 AND ?2) AS questions,
        (SELECT COUNT(*) FROM conversations WHERE created_at BETWEEN ?1 AND ?2 AND (wants_contact = 1 OR contact_clicked = 1)) AS contactRequests,
        (SELECT COUNT(*) FROM conversations WHERE created_at BETWEEN ?1 AND ?2 AND asked_pricing = 1) AS pricingQuestions,
        (SELECT COUNT(*) FROM conversations WHERE created_at BETWEEN ?1 AND ?2 AND contact_clicked = 1) AS chatContactClicks`, from, to),
    q(`SELECT ${day("ts")} AS d, COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS visitors FROM events WHERE type = 'pageview' AND ts BETWEEN ?1 AND ?2 GROUP BY d ORDER BY d`, from, to, tzs),
    q(`SELECT ${day("created_at")} AS d, COUNT(*) AS chats FROM conversations WHERE created_at BETWEEN ?1 AND ?2 GROUP BY d ORDER BY d`, from, to, tzs),
    q(`SELECT lang, COUNT(*) AS n FROM conversations WHERE created_at BETWEEN ?1 AND ?2 GROUP BY lang ORDER BY n DESC`, from, to),
    q(`SELECT j.value AS topic, COUNT(*) AS n FROM messages m, json_each(m.topics) j WHERE m.role = 'user' AND m.created_at BETWEEN ?1 AND ?2 GROUP BY topic ORDER BY n DESC`, from, to),
    q(`SELECT lower(trim(content, ' ?!.¿¡')) AS question, COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at BETWEEN ?1 AND ?2 GROUP BY question ORDER BY n DESC, MAX(created_at) DESC LIMIT 12`, from, to),
    q(`SELECT path, COUNT(*) AS n FROM events WHERE type = 'pageview' AND ts BETWEEN ?1 AND ?2 GROUP BY path ORDER BY n DESC LIMIT 10`, from, to),
    q(`SELECT COALESCE(referrer, '(direct or unknown)') AS referrer, COUNT(*) AS n FROM events WHERE type = 'pageview' AND ts BETWEEN ?1 AND ?2 GROUP BY referrer ORDER BY n DESC LIMIT 10`, from, to),
    q(`SELECT COALESCE(device, 'unknown') AS device, COUNT(*) AS n FROM events WHERE type = 'pageview' AND ts BETWEEN ?1 AND ?2 GROUP BY device ORDER BY n DESC`, from, to),
    q(`SELECT COALESCE(detail, 'other') AS detail, COUNT(*) AS n FROM events WHERE type = 'contact_click' AND ts BETWEEN ?1 AND ?2 GROUP BY detail ORDER BY n DESC`, from, to),
    q(`SELECT c.id, c.created_at, c.lang, c.message_count, c.wants_contact, c.contact_clicked, c.asked_pricing, c.business,
        (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY seq LIMIT 1) AS first_question
       FROM conversations c WHERE c.created_at BETWEEN ?1 AND ?2 ORDER BY c.created_at DESC LIMIT 6`, from, to),
    q(`SELECT ai_calls FROM usage WHERE day = ?1`, dayOf(Date.now())),
  ]);
  return json({
    range: { from, to },
    totals: totals.results[0],
    visitsByDay: visitsByDay.results, chatsByDay: chatsByDay.results,
    languages: langs.results, topics: topics.results, questions: questions.results,
    pages: pages.results, referrers: referrers.results, devices: devices.results, contacts: contacts.results,
    recent: recent.results,
    aiToday: { calls: usage.results[0]?.ai_calls || 0, limit: int(env.AI_DAILY_LIMIT, 300) },
  });
}

const LEAD_FILTERS = {
  contact: "(c.wants_contact = 1 OR c.contact_clicked = 1)",
  pricing: "c.asked_pricing = 1",
  project: "(c.business IS NOT NULL OR c.has_website IS NOT NULL OR c.services != '[]')",
};

async function listConversations(url, env) {
  const { from, to } = range(url);
  const where = ["c.created_at BETWEEN ?1 AND ?2"], args = [from, to];
  const lang = url.searchParams.get("lang");
  if (lang && LANGS.includes(lang)) { args.push(lang); where.push(`c.lang = ?${args.length}`); }
  const lead = url.searchParams.get("lead");
  if (lead && LEAD_FILTERS[lead]) where.push(LEAD_FILTERS[lead]);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  if (search) {
    args.push(`%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where.push(`EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ?${args.length} ESCAPE '\\')`);
  }
  const limit = Math.min(100, Math.max(1, int(url.searchParams.get("limit"), 50)));
  const offset = Math.max(0, int(url.searchParams.get("offset"), 0));
  args.push(limit + 1, offset);
  const { results } = await env.DB.prepare(`
    SELECT c.id, c.created_at, c.updated_at, c.lang, c.page, c.message_count, c.contact_clicked, c.services, c.business,
      c.has_website, c.asked_pricing, c.wants_contact, c.timeline, c.topics,
      (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY seq LIMIT 1) AS first_question
    FROM conversations c WHERE ${where.join(" AND ")}
    ORDER BY c.created_at DESC LIMIT ?${args.length - 1} OFFSET ?${args.length}`).bind(...args).all();
  return json({ conversations: results.slice(0, limit), more: results.length > limit });
}

async function getConversation(id, env) {
  const conv = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?1").bind(id).first();
  if (!conv) throw new HttpError(404, "not_found");
  delete conv.token_hash;
  const { results } = await env.DB.prepare("SELECT seq, role, content, created_at, source FROM messages WHERE conversation_id = ?1 ORDER BY seq").bind(id).all();
  return json({ conversation: conv, messages: results });
}

async function deleteConversation(id, env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM conversations WHERE id = ?1").bind(id),
  ]);
  return json({ ok: true });
}

// A short AI summary of one conversation, made only when the owner asks for it
async function summarise(id, env) {
  const { results } = await env.DB.prepare("SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY seq").bind(id).all();
  if (!results.length) throw new HttpError(404, "not_found");
  const transcript = results.map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`).join("\n").slice(0, 8000);
  const raw = await runModel(env, [
    { role: "system", content: "You summarise website chat conversations for the website owner, Marcos, a freelance web designer. Write in English, in at most 5 short bullet points: what the visitor wants, their type of business, their current website situation, anything they said about budget or timeline, and a suggested next step. Use only what the transcript says; write \"not mentioned\" when something is missing. Never guess personal details." },
    { role: "user", content: transcript },
  ], 300);
  const summary = String(raw).replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim().slice(0, 1500);
  await env.DB.prepare("UPDATE conversations SET summary = ?2 WHERE id = ?1").bind(id, summary).run();
  return json({ summary });
}

async function exportData(url, env) {
  const { from, to } = range(url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const { results } = await env.DB.prepare(`
    SELECT c.id AS conversation, c.created_at AS conversation_started, c.lang, c.page, c.business, c.has_website, c.services,
      c.asked_pricing, c.wants_contact, c.contact_clicked, c.timeline, m.seq, m.role, m.content, m.created_at
    FROM conversations c JOIN messages m ON m.conversation_id = c.id
    WHERE c.created_at BETWEEN ?1 AND ?2 ORDER BY c.created_at, m.seq LIMIT 20000`).bind(from, to).all();
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "cache-control": "no-store", "content-disposition": `attachment; filename="conversations-${stamp}.${format}"` };
  if (format === "json") return new Response(JSON.stringify(results, null, 1), { headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  const cols = Object.keys(results[0] || { conversation: 0, seq: 0, role: 0, content: 0 });
  // Cells that start with = + - @ are prefixed so spreadsheet apps don't run them as formulas
  const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const csv = [cols.join(","), ...results.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  return new Response("﻿" + csv, { headers: { ...headers, "content-type": "text/csv; charset=utf-8" } });
}

// Permanently delete records older than a date (or everything), from the database itself
async function purge(request, env) {
  const body = await readJson(request, 512);
  const before = int(body.before, Date.now());
  const target = body.target;
  if (!["analytics", "conversations", "all"].includes(target)) throw new HttpError(400, "invalid_target");
  const stmts = [];
  if (target !== "conversations") stmts.push(env.DB.prepare("DELETE FROM events WHERE ts < ?1").bind(before));
  if (target !== "analytics") stmts.push(
    env.DB.prepare("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE created_at < ?1)").bind(before),
    env.DB.prepare("DELETE FROM conversations WHERE created_at < ?1").bind(before),
  );
  const res = await env.DB.batch(stmts);
  return json({ ok: true, deleted: res.reduce((a, r) => a + (r.meta?.changes || 0), 0) });
}

function settings(env) {
  return json({
    model: env.MODEL,
    aiDailyLimit: int(env.AI_DAILY_LIMIT, 300),
    conversationRetentionDays: int(env.CONVERSATION_RETENTION_DAYS, 90),
    analyticsRetentionDays: int(env.ANALYTICS_RETENTION_DAYS, 365),
  });
}

export async function handleAdminApi(request, env, url) {
  const path = url.pathname.replace(/^\/admin\/api/, "");
  requireSameOrigin(request);
  if (path === "/login" && request.method === "POST") return login(request, env);
  if (path === "/logout" && request.method === "POST") return logout(request, env);
  await requireSession(request, env);
  if (path === "/me" && request.method === "GET") return json({ ok: true });
  if (path === "/overview" && request.method === "GET") return overview(url, env);
  if (path === "/conversations" && request.method === "GET") return listConversations(url, env);
  if (path === "/export" && request.method === "GET") return exportData(url, env);
  if (path === "/purge" && request.method === "POST") return purge(request, env);
  if (path === "/settings" && request.method === "GET") return settings(env);
  const m = path.match(/^\/conversations\/([0-9a-f-]{36})(\/summary)?$/);
  if (m && isUuid(m[1])) {
    if (!m[2] && request.method === "GET") return getConversation(m[1], env);
    if (!m[2] && request.method === "DELETE") return deleteConversation(m[1], env);
    if (m[2] && request.method === "POST") return summarise(m[1], env);
  }
  throw new HttpError(404, "not_found");
}

// Daily clean-up (cron): retention limits and expired sessions
export async function retention(env) {
  const now = Date.now();
  const convBefore = now - int(env.CONVERSATION_RETENTION_DAYS, 90) * 864e5;
  const evBefore = now - int(env.ANALYTICS_RETENTION_DAYS, 365) * 864e5;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE updated_at < ?1)").bind(convBefore),
    env.DB.prepare("DELETE FROM conversations WHERE updated_at < ?1").bind(convBefore),
    env.DB.prepare("DELETE FROM events WHERE ts < ?1").bind(evBefore),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(now),
    env.DB.prepare("DELETE FROM usage WHERE day < ?1").bind(dayOf(now - 60 * 864e5)),
    env.DB.prepare("DELETE FROM limits WHERE exp < ?1").bind(now),
  ]);
}
