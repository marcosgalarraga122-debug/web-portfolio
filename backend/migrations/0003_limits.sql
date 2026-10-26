-- Strict rate-limit counters (Cloudflare's rate-limiting binding is approximate). Keys are
-- "<scope>:<daily-salted hash of the IP>:<time window>", so no IP address is stored, and
-- rows expire within a day (deleted by the nightly clean-up).
CREATE TABLE limits (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
CREATE INDEX limits_exp ON limits (exp);
