-- Marcos's AI Assistant: initial schema (Cloudflare D1 / SQLite)
-- Times are milliseconds since the Unix epoch (UTC).

-- One chat conversation. The id is a random UUID; continuing it needs a secret token whose
-- SHA-256 is stored here, so a conversation can't be read or extended by guessing its id.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'es', 'fr')),
  page TEXT,                                   -- page section where the chat started
  visitor_id TEXT,                             -- only if the visitor accepted analytics
  message_count INTEGER NOT NULL DEFAULT 0,
  contact_clicked INTEGER NOT NULL DEFAULT 0,  -- used a contact option offered in the chat
  -- Enquiry indicators: simple matches on the visitor's own words (see src/text.js)
  services TEXT NOT NULL DEFAULT '[]',         -- JSON array
  business TEXT,
  has_website TEXT CHECK (has_website IN ('yes', 'no')),
  asked_pricing INTEGER NOT NULL DEFAULT 0,
  wants_contact INTEGER NOT NULL DEFAULT 0,
  timeline TEXT,
  topics TEXT NOT NULL DEFAULT '[]',           -- JSON array
  summary TEXT                                 -- AI summary, only made when the owner asks
);
CREATE INDEX conversations_created ON conversations (created_at);
CREATE INDEX conversations_updated ON conversations (updated_at);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  source TEXT,                                 -- assistant replies: 'ai' or 'fallback'
  topics TEXT                                  -- visitor messages: JSON array
);
CREATE INDEX messages_conversation ON messages (conversation_id, seq);
CREATE INDEX messages_created ON messages (role, created_at);

-- Visit analytics, recorded only after consent. No IP addresses or user agents.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,                           -- YYYY-MM-DD (UTC)
  type TEXT NOT NULL CHECK (type IN ('pageview', 'chat_open', 'chat_message', 'contact_click')),
  visitor_id TEXT NOT NULL,                    -- random ID kept in the visitor's browser
  path TEXT,
  referrer TEXT,                               -- referring domain only
  device TEXT,                                 -- desktop | tablet | mobile
  lang TEXT,
  detail TEXT                                  -- which contact option
);
CREATE INDEX events_type_ts ON events (type, ts);
CREATE INDEX events_ts ON events (ts);

-- Owner sessions: only the SHA-256 of the session token is stored
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Daily counters: model calls (budget) and failed sign-ins
CREATE TABLE usage (
  day TEXT PRIMARY KEY,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  login_failures INTEGER NOT NULL DEFAULT 0
);
