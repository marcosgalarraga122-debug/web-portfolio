/* Owner dashboard. Everything visitors wrote is inserted as text (never as HTML). */
"use strict";
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

// el("p.cls", { attr }, child, ...) — children are strings (as text) or nodes
function el(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split(".");
  const n = document.createElement(name);
  if (cls.length) n.className = cls.join(" ");
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
  return n;
}
function svg(tag, attrs) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}

const LANG_NAMES = { en: "English", es: "Spanish", fr: "French" };
const TOPIC_NAMES = {
  pricing: "Prices & quotes", services: "Services", redesign: "Redesign", examples: "Examples of work", timeline: "Timelines",
  start: "Getting started", mobile: "Mobile", performance: "Speed & performance", animations: "Animations & effects",
  support: "Support & maintenance", about: "About Marcos", contact: "Contact", seo: "Search engines (SEO)",
};
const CONTACT_NAMES = {
  email_link: "Clicked the email address", email_copy: "Copied the email address", contact_form: "Sent the contact form",
  chat_email: "Email button in the chat", chat_form: "Contact-form button in the chat", chat_draft: "Opened an enquiry draft from the chat",
  cv_download: "Downloaded the CV", other: "Other",
};
const nf = new Intl.NumberFormat("en-GB");
const fmtDate = (ts) => new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/* ---------- API ---------- */
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/admin/api${path}`, {
    method, credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("unauthorized"); }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ---------- Login ---------- */
function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#password").focus();
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("button", e.target), err = $("#login-error");
  btn.disabled = true; err.textContent = "";
  try {
    await api("/login", { method: "POST", body: { password: $("#password").value } });
    $("#password").value = "";
    start();
  } catch (x) {
    err.textContent = {
      wrong_password: "That password isn't right.",
      rate_limited: "Too many attempts. Wait a minute and try again.",
      locked: "Sign-in is paused for today after too many failed attempts.",
      not_configured: "The dashboard password hasn't been set up yet (ADMIN_PASSWORD).",
    }[x.message] || "Couldn't sign in. Check your connection and try again.";
  } finally { btn.disabled = false; }
});
$("#logout").addEventListener("click", async () => {
  await api("/logout", { method: "POST" }).catch(() => {});
  showLogin();
});

/* ---------- Date range ---------- */
const state = { range: "30", from: null, to: null, view: "overview" };
function currentRange() {
  const now = new Date();
  if (state.range === "custom" && state.from && state.to) {
    return { from: new Date(`${state.from}T00:00:00`).getTime(), to: new Date(`${state.to}T23:59:59.999`).getTime() };
  }
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (state.range !== "today") start.setDate(start.getDate() - (Number(state.range) - 1));
  return { from: start.getTime(), to: now.getTime() };
}
const rangeQuery = () => { const r = currentRange(); return `from=${r.from}&to=${r.to}&tz=${-new Date().getTimezoneOffset()}`; };
function syncChips() {
  $$("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === state.range)));
  $("#custom").hidden = state.range !== "custom";
}
$$("[data-range]").forEach((b) => b.addEventListener("click", () => {
  state.range = b.dataset.range;
  syncChips();
  if (state.range === "custom") {
    const r = currentRange();
    $("#from").value ||= new Date(r.from - 29 * 864e5).toISOString().slice(0, 10);
    $("#to").value ||= new Date().toISOString().slice(0, 10);
    return;
  }
  render();
}));
$("#apply").addEventListener("click", () => {
  if (!$("#from").value || !$("#to").value || $("#from").value > $("#to").value) return;
  state.from = $("#from").value; state.to = $("#to").value;
  render();
});

/* ---------- Views ---------- */
$$(".tab").forEach((t) => t.addEventListener("click", () => {
  state.view = t.dataset.view;
  $$(".tab").forEach((x) => x.toggleAttribute("aria-current", x === t));
  render();
}));

async function render() {
  const view = $("#view");
  $(".filters").hidden = state.view === "data";
  view.replaceChildren(el("p.empty", {}, "Loading…"));
  try {
    if (state.view === "overview") await renderOverview(view);
    else if (state.view === "conversations") await renderConversations(view);
    else await renderData(view);
  } catch (e) {
    if (e.message !== "unauthorized") view.replaceChildren(el("p.empty", {}, `Couldn't load this view (${e.message}). Try again in a moment.`));
  }
}

function kpi(label, value, note) {
  return el("div.card.kpi", {}, el("p.label", {}, label), el("p.value", {}, nf.format(value || 0)), note ? el("p.note", {}, note) : null);
}

// Every day in the range, so days without data show as zero
function fillDays(rows, key) {
  const { from, to } = currentRange();
  const by = new Map(rows.map((r) => [r.d, r[key]]));
  const out = [];
  const d = new Date(from); d.setHours(12, 0, 0, 0);
  while (d.getTime() <= to + 12 * 36e5 && out.length < 400) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ d: k, v: by.get(k) || 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Single-series column chart with a hover tooltip on each day. Drawn at the box's real
// width (and redrawn when it changes) so text and bars are never stretched.
function columns(days, unit) {
  const box = el("div");
  let last = 0;
  new ResizeObserver(() => {
    const w = Math.round(box.clientWidth);
    if (w && w !== last) { last = w; box.replaceChildren(drawColumns(days, unit, w)); }
  }).observe(box);
  return box;
}
function niceStep(max) {
  if (max <= 4) return 1;
  const rough = max / 4, mag = Math.pow(10, Math.floor(Math.log10(rough)));
  return [1, 2, 5, 10].find((m) => m * mag >= rough) * mag;
}
function drawColumns(days, unit, W) {
  const H = 200, padL = 32, padB = 22, padT = 8;
  const max = Math.max(1, ...days.map((x) => x.v));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const s = svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `${unit} per day` });
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  for (let v = 0; v <= top; v += step) {
    s.append(svg("line", { class: "grid-line", x1: padL, x2: W, y1: y(v), y2: y(v) }));
    const t = svg("text", { class: "axis", x: padL - 6, y: y(v) + 4, "text-anchor": "end" }); t.textContent = nf.format(v); s.append(t);
  }
  const band = (W - padL) / days.length, bw = Math.min(24, Math.max(2, band - 2));
  days.forEach((x, i) => {
    const cx = padL + band * i + band / 2, h = y(0) - y(x.v), r = Math.min(4, bw / 2, h);
    const hit = svg("rect", { class: "hit", x: padL + band * i, y: padT, width: band, height: H - padT - padB });
    const left = cx - bw / 2, right = cx + bw / 2, base = y(0), tp = y(x.v);
    const bar = svg("path", { class: "bar", d: x.v ? `M${left},${base} V${tp + r} Q${left},${tp} ${left + r},${tp} H${right - r} Q${right},${tp} ${right},${tp + r} V${base} Z` : "" });
    hit.addEventListener("mousemove", (e) => showTip(e, `${fmtDay(x.d)} · ${nf.format(x.v)} ${unit}`));
    hit.addEventListener("mouseleave", hideTip);
    s.append(hit, bar);
  });
  const labels = days.length <= 1 ? [0] : [0, Math.floor((days.length - 1) / 2), days.length - 1];
  [...new Set(labels)].forEach((i) => {
    const t = svg("text", { class: "axis", x: padL + band * i + band / 2, y: H - 4, "text-anchor": i === 0 ? "start" : i === days.length - 1 ? "end" : "middle" });
    t.textContent = fmtDay(days[i].d); s.append(t);
  });
  return s;
}
function showTip(e, text) {
  const tip = $("#tip");
  tip.textContent = text; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(innerWidth - r.width - 8, e.clientX + 12)}px`;
  tip.style.top = `${Math.max(8, e.clientY - r.height - 10)}px`;
}
const hideTip = () => ($("#tip").hidden = true);

// Ranked list with proportional bars, plus a table view of the same numbers
function barList(rows, nameOf, empty) {
  if (!rows.length) return el("p.empty", {}, empty);
  const max = Math.max(...rows.map((r) => r.n));
  const list = el("ul.bars", {}, rows.map((r) => el("li", {},
    el("span.name", {}, nameOf(r)), el("span.n", {}, nf.format(r.n)),
    el("span.track", {}, el("span.fill", { style: `width:${(100 * r.n) / max}%` })))));
  const table = el("table", { hidden: true }, el("thead", {}, el("tr", {}, el("th", {}, "Item"), el("th.num", {}, "Count"))),
    el("tbody", {}, rows.map((r) => el("tr", {}, el("td", {}, nameOf(r)), el("td.num", {}, nf.format(r.n))))));
  const toggle = el("button.link.table-toggle", { onclick: () => { const t = table.hidden; table.hidden = !t; list.hidden = t; toggle.textContent = t ? "Show as bars" : "Show as table"; } }, "Show as table");
  return el("div", {}, list, table, toggle);
}

function leadTags(c) {
  const tags = [];
  if (c.wants_contact || c.contact_clicked) tags.push(el("span.tag.strong", {}, c.contact_clicked ? "Clicked a contact option" : "Asked for contact / a quote"));
  if (c.asked_pricing) tags.push(el("span.tag", {}, "Asked about prices"));
  if (c.business) tags.push(el("span.tag", {}, c.business));
  return el("div.tags", {}, tags);
}
function convRow(c) {
  return el("li", {}, el("button.conv", { onclick: () => openConversation(c.id) },
    el("span.q", {}, c.first_question || "(no question)"),
    el("span.meta", {}, el("span", {}, fmtDate(c.created_at)), el("span", {}, LANG_NAMES[c.lang] || c.lang), el("span", {}, `${Math.ceil(c.message_count / 2)} question${c.message_count > 2 ? "s" : ""}`)),
    leadTags(c)));
}

async function renderOverview(view) {
  const d = await api(`/overview?${rangeQuery()}`);
  const t = d.totals;
  view.replaceChildren(
    el("p.notice", {}, "Visits, unique visitors and contact clicks only count visitors who accepted analytics in the cookie banner. Chat numbers count every conversation."),
    el("div.grid.kpis", {},
      kpi("Visits", t.visits, "Page views"),
      kpi("Unique visitors", t.visitors, "Browsers that accepted analytics"),
      kpi("Chat conversations", t.conversations),
      kpi("Questions asked", t.questions),
      kpi("Opened the assistant", t.chatOpeners, "Unique visitors who opened it"),
      kpi("Contact clicks on the site", t.contactClicks),
      kpi("Asked for contact or a quote", t.contactRequests, "In the chat"),
      kpi("Asked about prices", t.pricingQuestions, "In the chat"),
    ),
    el("div.grid.cols", {},
      el("section.card", {}, el("h3", {}, "Visits per day"), el("p.sub", {}, "Page views by visitors who accepted analytics"),
        d.visitsByDay.length ? columns(fillDays(d.visitsByDay, "visits"), "visits") : el("p.empty", {}, "No visits recorded in this period yet.")),
      el("section.card", {}, el("h3", {}, "Chat conversations per day"), el("p.sub", {}, "Conversations started with the assistant"),
        d.chatsByDay.length ? columns(fillDays(d.chatsByDay, "chats"), "conversations") : el("p.empty", {}, "No conversations in this period yet.")),
    ),
    el("div.grid.cols", {},
      el("section.card", {}, el("h3", {}, "What visitors ask about"), el("p.sub", {}, "Topics found in visitors' questions (a question can have several)"),
        barList(d.topics, (r) => TOPIC_NAMES[r.topic] || r.topic, "No questions yet.")),
      el("section.card", {}, el("h3", {}, "Most frequent questions"), el("p.sub", {}, "Identical questions grouped (suggested questions often repeat)"),
        barList(d.questions, (r) => r.question, "No questions yet.")),
    ),
    el("section.card", { style: "margin-top:16px" }, el("h3", {}, "Recent conversations"), el("p.sub", {}, "Open one to read it"),
      d.recent.length ? el("ul.convs", {}, d.recent.map(convRow)) : el("p.empty", {}, "No conversations in this period yet.")),
    el("div.grid.cols", {},
      el("section.card", {}, el("h3", {}, "Chat languages"), barList(d.languages.map((r) => ({ ...r, n: r.n })), (r) => LANG_NAMES[r.lang] || r.lang, "No conversations yet.")),
      el("section.card", {}, el("h3", {}, "Contact actions"), el("p.sub", {}, "From visitors who accepted analytics"), barList(d.contacts, (r) => CONTACT_NAMES[r.detail] || r.detail, "No contact actions recorded yet.")),
      el("section.card", {}, el("h3", {}, "Where visitors come from"), el("p.sub", {}, "Referring website"), barList(d.referrers, (r) => r.referrer, "No visits recorded yet.")),
      el("section.card", {}, el("h3", {}, "Devices"), barList(d.devices, (r) => r.device[0].toUpperCase() + r.device.slice(1), "No visits recorded yet.")),
      el("section.card", {}, el("h3", {}, "Pages"), barList(d.pages, (r) => r.path, "No visits recorded yet.")),
      el("section.card", {}, el("h3", {}, "AI usage today"), el("p.sub", {}, "Model replies used of today's free budget (resets at midnight UTC). After that, the assistant answers from your site's information."),
        el("p.kpi", {}, el("span.value", {}, `${nf.format(d.aiToday.calls)} / ${nf.format(d.aiToday.limit)}`))),
    ),
  );
}

let listState = { q: "", lang: "", lead: "", offset: 0 };
async function renderConversations(view) {
  const search = el("input", { type: "search", placeholder: "Search questions and answers…", value: listState.q, "aria-label": "Search conversations" });
  const lang = el("select", { "aria-label": "Language" }, el("option", { value: "" }, "All languages"),
    Object.entries(LANG_NAMES).map(([k, v]) => el("option", { value: k, selected: listState.lang === k }, v)));
  const lead = el("select", { "aria-label": "Type of conversation" }, el("option", { value: "" }, "All conversations"),
    el("option", { value: "contact", selected: listState.lead === "contact" }, "Asked for contact / quote"),
    el("option", { value: "pricing", selected: listState.lead === "pricing" }, "Asked about prices"),
    el("option", { value: "project", selected: listState.lead === "project" }, "Described their business or project"));
  const list = el("ul.convs");
  const more = el("div.more");
  const load = async (append) => {
    if (!append) listState.offset = 0;
    const p = new URLSearchParams({ q: listState.q, lang: listState.lang, lead: listState.lead, offset: listState.offset, limit: 50 });
    const d = await api(`/conversations?${rangeQuery()}&${p}`);
    if (!append) list.replaceChildren();
    list.append(...d.conversations.map(convRow));
    if (!list.children.length) list.replaceChildren(el("p.empty", {}, listState.q || listState.lang || listState.lead ? "No conversations match these filters." : "No conversations in this period yet."));
    more.replaceChildren(d.more ? el("button.btn.ghost.small", { onclick: () => { listState.offset += 50; load(true); } }, "Load more") : "");
  };
  let timer;
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { listState.q = search.value.trim(); load(); }, 300); });
  lang.addEventListener("change", () => { listState.lang = lang.value; load(); });
  lead.addEventListener("change", () => { listState.lead = lead.value; load(); });
  view.replaceChildren(el("div.toolbar", {}, search, lang, lead), list, more);
  await load();
}

async function openConversation(id) {
  const dlg = $("#drawer"), body = $("#drawer-body");
  body.replaceChildren(el("p.empty", {}, "Loading…"));
  if (!dlg.open) dlg.showModal();
  const { conversation: c, messages } = await api(`/conversations/${id}`);
  $("#drawer-meta").textContent = `${fmtDate(c.created_at)} · ${LANG_NAMES[c.lang] || c.lang}`;
  const services = JSON.parse(c.services || "[]"), topics = JSON.parse(c.topics || "[]");
  const fact = (k, v) => [el("dt", {}, k), el("dd", {}, v || "Not mentioned")];
  const summary = el("p.summary", {}, c.summary || "");
  const sumBtn = el("button.btn.ghost.small", { onclick: async () => {
    sumBtn.disabled = true; summary.textContent = "Summarising…";
    try { summary.textContent = (await api(`/conversations/${id}/summary`, { method: "POST" })).summary; }
    catch { summary.textContent = "Couldn't summarise right now (the AI may be over today's budget)."; }
    finally { sumBtn.disabled = false; }
  } }, c.summary ? "Summarise again" : "Summarise with AI");
  const del = el("button.btn.danger.small", { onclick: async () => {
    if (!confirm("Delete this conversation permanently? This can't be undone.")) return;
    await api(`/conversations/${id}`, { method: "DELETE" });
    dlg.close(); render();
  } }, "Delete conversation");
  body.replaceChildren(
    el("section", {}, el("h2", {}, "What the visitor told the assistant"),
      el("dl.facts", { style: "margin-top:12px" },
        fact("Type of business", c.business),
        fact("Has a website", c.has_website === "yes" ? "Yes" : c.has_website === "no" ? "No" : null),
        fact("Services of interest", services.join(", ")),
        fact("Timeline mentioned", c.timeline),
        fact("Asked about prices", c.asked_pricing ? "Yes" : "No"),
        fact("Asked for contact / a quote", c.wants_contact ? "Yes" : "No"),
        fact("Used a contact option in the chat", c.contact_clicked ? "Yes" : "No"),
        fact("Topics", topics.map((x) => TOPIC_NAMES[x] || x).join(", ")),
        fact("Started on", c.page)),
      el("p.explain", { style: "margin-top:10px" }, "These come from simple word matches in the visitor's own messages, not from guesses about them. Read the conversation to judge it.")),
    el("section", {}, el("div.actions", {}, sumBtn), summary),
    el("section", {}, el("h2", { style: "margin-bottom:12px" }, "Conversation"),
      el("div.transcript", {}, messages.map((m) => el(`div.msg.${m.role}`, {}, m.content.replace(/\[\[\/?ENQUIRY\]\]/g, "—"),
        el("span.when", {}, `${m.role === "user" ? "Visitor" : m.source === "fallback" ? "Assistant (from site info)" : "Assistant"} · ${fmtDate(m.created_at)}`))))),
    el("section", {}, el("div.actions", {}, del)),
  );
}
$("#drawer-close").addEventListener("click", () => $("#drawer").close());
$("#drawer").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

async function renderData(view) {
  const s = await api("/settings");
  const status = el("p.status", { role: "status" });
  const target = el("select", { "aria-label": "What to delete" },
    el("option", { value: "conversations" }, "Conversations"), el("option", { value: "analytics" }, "Visit analytics"), el("option", { value: "all" }, "Both"));
  const before = el("input", { type: "date", value: new Date().toISOString().slice(0, 10), "aria-label": "Delete records before" });
  const exportLink = (format) => el("a.btn.ghost.small", { href: `/admin/api/export?format=${format}&${rangeQuery()}`, download: "" }, `Export ${format.toUpperCase()}`);
  view.replaceChildren(el("div.grid.cols", {},
    el("section.card.prose", {}, el("h3", {}, "What is collected"),
      el("p", {}, "Chat: every visitor's questions and the assistant's replies, the language, the page section where the chat started and whether a contact option in the chat was used. Visitors see a notice about this in the chat."),
      el("p", {}, "Analytics (only after the visitor accepts in the cookie banner): page views, opening the assistant, sending a question and contact clicks, with the page, referring website, device type, site language and a random ID stored in that browser."),
      el("p", {}, "Never collected: IP addresses, browser fingerprints, precise location or names and emails (unless a visitor types them into the chat themselves).")),
    el("section.card.prose", {}, el("h3", {}, "Retention"),
      el("ul", {},
        el("li", {}, `Conversations are deleted automatically ${s.conversationRetentionDays} days after their last message.`),
        el("li", {}, `Analytics events are deleted automatically after ${s.analyticsRetentionDays} days.`),
        el("li", {}, "Clean-up runs every night. Deleting removes the records from the database itself.")),
      el("p", {}, `AI model: ${s.model}. Daily limit: ${s.aiDailyLimit} replies.`)),
    el("section.card", {}, el("h3", {}, "Export conversations"), el("p.sub", {}, "Conversations started in the selected date range (Overview filters)"),
      el("div.actions", {}, exportLink("csv"), exportLink("json"))),
    el("section.card", {}, el("h3", {}, "Delete records"), el("p.sub", {}, "Permanently delete everything older than a date"),
      el("div.form-row", {}, el("label", {}, "Delete", target), el("label", {}, "Older than", before),
        el("button.btn.danger.small", { onclick: async () => {
          const when = new Date(`${before.value}T00:00:00`).getTime();
          if (!before.value || !confirm(`Permanently delete ${target.selectedOptions[0].textContent.toLowerCase()} older than ${before.value}?`)) return;
          try { const r = await api("/purge", { method: "POST", body: { target: target.value, before: when } }); status.textContent = `Deleted ${nf.format(r.deleted)} records.`; }
          catch (e) { status.textContent = `Couldn't delete (${e.message}).`; }
        } }, "Delete")),
      status),
  ));
}

/* ---------- Start ---------- */
async function start() {
  try { await api("/me"); } catch { return; }
  $("#login").hidden = true;
  $("#app").hidden = false;
  syncChips();
  render();
}
start();
