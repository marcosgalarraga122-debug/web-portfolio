# Marcos's AI Assistant — backend

The chat on the portfolio and the private owner dashboard run on **Cloudflare's free plan**:

| Part | Cloudflare product | Free-plan limit | When the limit is reached |
|---|---|---|---|
| API and dashboard | Workers | 100,000 requests/day, 10 ms CPU per request | requests fail until 00:00 UTC |
| Conversations and analytics | D1 (SQLite), EU jurisdiction | 5 GB, 5M rows read and 100k written per day | queries fail until 00:00 UTC |
| AI replies | Workers AI (`MODEL` in `wrangler.toml`) | 10,000 neurons/day | the chat answers from `knowledge.js` instead |

On the free plan nothing is ever billed: going over a limit makes requests fail, it doesn't charge.
`AI_DAILY_LIMIT` (300 replies) keeps the model inside its free allowance. Only if you ever move to
Workers Paid would usage beyond the allowance cost money ($0.011 per 1,000 neurons), and that cap
keeps it bounded.

## How a reply is made

1. The site sends the visitor's message to `POST /api/chat` (only the portfolio's own origin is accepted).
2. The Worker detects the language (English, Spanish or French), finds the relevant entries in
   `src/knowledge.js`, and asks the model with strict rules: only these facts, no invented prices,
   clients, contact details or promises, and the visitor's text can't change the rules.
3. The reply is filtered: any URL, email address or phone number that isn't Marcos's real one is removed.
4. If the model fails, is slow (25 s) or today's budget is used, the reply is built from `knowledge.js` directly.
5. The message and reply are stored; each conversation can only be continued with its secret token.

## What the assistant knows: `src/knowledge.js`

Edit this file to change the facts (services, process, prices policy, background, contact), then
deploy (`npm run deploy`). `CONTACT.phone`, `whatsapp` and `booking` are `null` until they exist;
set them and the assistant will use them (and stop filtering that phone number out).

## Data collected

| Data | When | Kept | Purpose |
|---|---|---|---|
| Chat messages and replies, time, language, page section, contact option used in the chat | every chat (visitors see a notice) | 90 days after the last message | answer, follow up on enquiries, improve |
| Enquiry indicators (business type, has a website, services, pricing, contact request, timeline) | word matches on the visitor's own messages | with the conversation | sort enquiries in the dashboard |
| Page views, opening the assistant, questions sent, contact clicks, with path, referring domain, device type, language and a random browser ID | **only after "Accept"** in the cookie banner | 365 days | visit statistics |
| Owner sessions (hash of the token) | sign-in | 12 hours | dashboard access |

Never stored: IP addresses (rate limiting uses a daily-salted hash kept only in memory), user agents,
fingerprints, location. Deleting in the dashboard deletes rows from the database. A nightly job
(cron) applies the retention limits; change them with `CONVERSATION_RETENTION_DAYS` and
`ANALYTICS_RETENTION_DAYS`. The public explanation is `privacy.html` in the site.

## Security

- Dashboard at `https://<worker>.workers.dev/admin`: password in the Worker secret `ADMIN_PASSWORD`
  (never in code), compared in constant time; HttpOnly, Secure, SameSite=Strict session cookie
  stored as a hash in D1 for 12 h; sign-in limited to 5 tries/minute per visitor and 200 failures/day overall.
- Every `/admin/api/*` route checks the session on the server; changes also require the dashboard's own origin.
- Strict Content-Security-Policy on the dashboard, no framing, all visitor text rendered as text.
- Public API: origin allow-list, 4 KB bodies, 800-character messages, 30 messages per conversation,
  8 chat requests/minute and 60 analytics events/minute per visitor.

## Setup (once)

```sh
~/Projects/web-portfolio/backend/setup.sh
```

Signs in to Cloudflare (browser), creates the EU database, deploys, generates `HASH_SECRET` and asks
you to choose `ADMIN_PASSWORD`. Then put the printed `https://marcos-assistant.….workers.dev` address
in `<meta name="assistant-api">` in the site's `index.html` and in `admin/index.html`.

## Everyday commands

```sh
export PATH="$HOME/.local/node/bin:$PATH"; cd ~/Projects/web-portfolio/backend
npm run deploy                                # publish changes to the backend
npx wrangler secret put ADMIN_PASSWORD        # change the dashboard password
npx wrangler tail                             # watch live logs (no message content is logged)
npm test                                      # unit tests (language, retrieval, filters)
test/dev-local.sh                             # run offline on http://127.0.0.1:8787 with a mock AI
python3 test/api_test.py http://127.0.0.1:8787 http://127.0.0.1:8610 local-test-password-123
```
