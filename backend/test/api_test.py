#!/usr/bin/env python3
"""End-to-end API checks against a running Worker (local: test/dev-local.sh, MOCK_AI=1).
usage: api_test.py <base-url> <site-origin> <admin-password|-> [--no-mock]
With "-" as the password (e.g. against production), the signed-in checks are skipped.
Covers: CORS/origin checks, validation and size limits, conversation tokens, fallback,
admin authentication, sessions, CSRF, deletion, export, analytics, rate limits."""
import json, sys, urllib.request, urllib.error

BASE, SITE, PASSWORD = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
MOCK = "--no-mock" not in sys.argv
SIGNED_IN = PASSWORD != "-"
results = []

def req(method, path, body=None, origin=SITE, cookie=None, raw=None, ctype="text/plain"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"User-Agent": "Mozilla/5.0 (api-test)"}
    if origin: h["Origin"] = origin
    if cookie: h["Cookie"] = cookie
    if data is not None: h["Content-Type"] = ctype
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as res:
            text = res.read().decode("utf-8", "replace")
            return res.status, {k.lower(): v for k, v in res.headers.items()}, text
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as e:
        return 0, {}, f"network error: {e}"

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"   -> {detail[:300]}"))

def js(t):
    try: return json.loads(t)
    except Exception: return {}

# --- public API: origins
s, h, _ = req("OPTIONS", "/api/chat")
check("preflight from the site is allowed", s == 204 and h.get("access-control-allow-origin") == SITE, str((s, h)))
s, h, _ = req("OPTIONS", "/api/chat", origin="https://evil.example")
check("preflight from another site is refused", s == 403 and "access-control-allow-origin" not in h, str(s))
s, _, _ = req("POST", "/api/chat", {"message": "hi", "lang": "en"}, origin=None)
check("chat without an Origin is refused", s == 403, str(s))
s, _, _ = req("POST", "/api/chat", {"message": "hi", "lang": "en"}, origin="https://evil.example")
check("chat from another site is refused", s == 403, str(s))
s, _, _ = req("GET", "/api/chat")
check("GET on the chat API is refused", s == 405, str(s))

# --- validation
s, _, t = req("POST", "/api/chat", {"message": "", "lang": "en"})
check("empty message is rejected", s == 400, t)
s, _, t = req("POST", "/api/chat", {"message": "a" * 801, "lang": "en"})
check("message over 800 characters is rejected", s == 400 and "too_long" in t, t)
s, _, t = req("POST", "/api/chat", raw=b"{not json")
check("invalid JSON is rejected", s == 400, t)
s, _, t = req("POST", "/api/chat", raw=json.dumps({"message": "x", "pad": "y" * 5000}).encode())
check("body over 4 KB is rejected", s == 413, t)

# --- a conversation
s, _, t = req("POST", "/api/chat", {"message": "I run a small restaurant and my website looks old. How much would a redesign cost?", "lang": "en", "page": "hero"})
d = js(t)
check("chat replies", s == 200 and d.get("reply") and d.get("conversationId") and len(d.get("token", "")) == 43, t)
cid, tok = d.get("conversationId"), d.get("token")
if MOCK:
    check("invented phone number and link are filtered out", "611" not in d["reply"] and "evil.example" not in d["reply"], d.get("reply", ""))
check("pricing question offers contact options", d.get("actions") == ["email", "form"], t)
s, _, t = req("POST", "/api/chat", {"message": "And how long would it take?", "lang": "en", "conversationId": cid, "token": "A" * 43})
check("continuing with a wrong token is refused", s == 404, t)
s, _, t = req("POST", "/api/chat", {"message": "And how long would it take?", "lang": "en", "conversationId": cid, "token": tok})
d2 = js(t)
check("continuing with the right token works", s == 200 and d2.get("conversationId") == cid and "token" not in d2, t)
s, _, t = req("POST", "/api/chat", {"message": "¿Puedes rediseñar mi página web?", "lang": "en"})
check("Spanish message is answered in Spanish", s == 200 and js(t).get("lang") == "es", t)
if MOCK:
    s, _, t = req("POST", "/api/chat", {"message": "__fail__ how much does it cost?", "lang": "en"})
    d3 = js(t)
    check("model failure falls back to site information", s == 200 and d3.get("source") == "fallback" and "quote" in d3.get("reply", ""), t)
s, _, t = req("POST", "/api/chat/contact", {"conversationId": cid, "token": tok})
check("contact click is recorded with the token", s == 204, t)
s, _, t = req("POST", "/api/chat/contact", {"conversationId": cid, "token": "B" * 43})
check("contact click with a wrong token is refused", s == 404, t)

# --- analytics
vid = "0123456789abcdef0123456789abcdef"
s, _, t = req("POST", "/api/event", {"type": "pageview", "visitorId": vid, "path": "/web-portfolio/?utm=x", "referrer": "https://www.google.com/search?q=x", "device": "mobile", "lang": "es"})
check("analytics event is accepted", s == 204, t)
s, _, t = req("POST", "/api/event", {"type": "pageview", "visitorId": "not-an-id"})
check("analytics event without a valid visitor ID is rejected", s == 400, t)
s, _, t = req("POST", "/api/event", {"type": "keylogger", "visitorId": vid})
check("unknown event type is rejected", s == 400, t)

# --- admin: nothing private without a session
for method, path in [("GET", "/admin/api/overview"), ("GET", "/admin/api/conversations"), ("GET", f"/admin/api/conversations/{cid}"),
                     ("GET", "/admin/api/export?format=csv"), ("GET", "/admin/api/settings")]:
    s, _, t = req(method, path, origin=None)
    check(f"{method} {path.split('?')[0]} needs a session", s == 401, t)
s, _, t = req("DELETE", f"/admin/api/conversations/{cid}", origin=BASE)
check("deleting without a session is refused", s == 401, t)
s, _, t = req("POST", "/admin/api/purge", {"target": "all"}, origin=BASE)
check("purging without a session is refused", s == 401, t)
s, _, t = req("GET", "/admin/api/overview", origin=None, cookie="__Host-mas_session=" + "C" * 43)
check("a made-up session cookie is refused", s == 401, t)

# --- login
s, _, t = req("POST", "/admin/api/login", {"password": "wrong-password-123"}, origin=BASE, ctype="application/json")
check("wrong password is refused", s in (401, 503), t)
if SIGNED_IN:
    s, _, t = req("POST", "/admin/api/login", {"password": PASSWORD}, origin="https://evil.example", ctype="application/json")
    check("login from another site is refused (CSRF)", s == 403, t)
    s, h, t = req("POST", "/admin/api/login", {"password": PASSWORD}, origin=BASE, ctype="application/json")
    sc = h.get("set-cookie", "")
    check("correct password signs in", s == 200 and "__Host-mas_session=" in sc, t)
    check("session cookie is HttpOnly, Secure and SameSite=Strict", all(x in sc for x in ["HttpOnly", "Secure", "SameSite=Strict"]), sc)
    cookie = sc.split(";")[0]

    s, _, t = req("GET", "/admin/api/overview", origin=None, cookie=cookie)
    o = js(t)
    check("overview loads with a session", s == 200 and o["totals"]["conversations"] >= 2 and o["totals"]["visits"] >= 1, t)
    s, _, t = req("GET", "/admin/api/conversations?q=restaurant", origin=None, cookie=cookie)
    lst = js(t).get("conversations", [])
    check("search finds the conversation", s == 200 and any(c["id"] == cid for c in lst), t)
    c0 = next((c for c in lst if c["id"] == cid), {})
    check("enquiry indicators were extracted", c0.get("business") == "restaurant" and c0.get("asked_pricing") == 1 and c0.get("has_website") == "yes" and c0.get("contact_clicked") == 1, json.dumps(c0))
    s, _, t = req("GET", f"/admin/api/conversations/{cid}", origin=None, cookie=cookie)
    cd = js(t)
    check("conversation shows messages in order, without the token hash", s == 200 and [m["seq"] for m in cd["messages"]] == [1, 2, 3, 4] and "token_hash" not in cd["conversation"], t)
    s, h, t = req("GET", "/admin/api/export?format=csv", origin=None, cookie=cookie)
    check("CSV export works", s == 200 and "attachment" in h.get("content-disposition", "") and "restaurant" in t, t[:200])
    s, _, t = req("DELETE", f"/admin/api/conversations/{cid}", origin="https://evil.example", cookie=cookie)
    check("cross-site delete is refused even with the cookie", s == 403, t)
    s, _, t = req("DELETE", f"/admin/api/conversations/{cid}", origin=BASE, cookie=cookie)
    check("owner can delete a conversation", s == 200, t)
    s, _, t = req("GET", f"/admin/api/conversations/{cid}", origin=None, cookie=cookie)
    check("deleted conversation is gone from the database", s == 404, t)
    s, _, t = req("POST", "/api/chat", {"message": "hello again", "lang": "en", "conversationId": cid, "token": tok})
    check("visitor can't continue a deleted conversation", s == 404, t)


# --- secrets never reach the browser
s, _, page = req("GET", "/admin", origin=None)
s2, _, appjs = req("GET", "/admin/app.js", origin=None)
import re
long_tokens = re.findall(r"[A-Za-z0-9+/_-]{40,}", page + appjs)  # anything shaped like a key or token
check("dashboard page and script contain no secrets", (not SIGNED_IN or (PASSWORD not in page and PASSWORD not in appjs)) and not long_tokens, str(long_tokens[:3]))
s, h, _ = req("GET", "/admin", origin=None)
check("dashboard sends a strict CSP and can't be framed", "frame-ancestors 'none'" in h.get("content-security-policy", "") and h.get("x-frame-options") == "DENY", str(h))

if SIGNED_IN:
    # --- logout ends the session
    s, _, t = req("POST", "/admin/api/logout", {}, origin=BASE, cookie=cookie, ctype="application/json")
    s2, _, t2 = req("GET", "/admin/api/overview", origin=None, cookie=cookie)
    check("after signing out the session no longer works", s == 200 and s2 == 401, t2)


# --- rate limits (last: they lock this IP out for a minute)
codes = [req("POST", "/admin/api/login", {"password": "nope-nope-nope"}, origin=BASE, ctype="application/json")[0] for _ in range(7)]
check("repeated sign-in attempts are rate limited", 429 in codes, str(codes))
codes = [req("POST", "/api/chat", {"message": "hi", "lang": "en"})[0] for _ in range(12)]
check("chat requests are rate limited", 429 in codes, str(codes))

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
