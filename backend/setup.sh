#!/bin/zsh
# One-time setup of Marcos's AI Assistant on your Cloudflare account (Workers Free plan).
# Run it yourself in Terminal:  ~/Projects/web-portfolio/backend/setup.sh
# It signs you in to Cloudflare in your browser, creates the database (stored in the EU),
# deploys the backend and asks you to choose the dashboard password. Safe to run again.
set -e
cd "${0:A:h}"
export PATH="$HOME/.local/node/bin:$PATH"
[ -d node_modules ] || npm install --no-fund --no-audit

echo "\n1/5  Cloudflare sign-in"
npx wrangler whoami 2>/dev/null | grep -q "You are logged in" || npx wrangler login

echo "\n2/5  Database (EU jurisdiction)"
if grep -q '00000000-0000-0000-0000-000000000000' wrangler.toml; then
  out=$(CI=true npx wrangler d1 create assistant --jurisdiction eu 2>&1) || { echo "$out"; exit 1; }
  id=$(echo "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  [ -n "$id" ] || { echo "$out"; echo "Couldn't read the database id."; exit 1; }
  sed -i '' "s/00000000-0000-0000-0000-000000000000/$id/" wrangler.toml
  echo "Created database $id"
fi
CI=true npx wrangler d1 migrations apply assistant --remote

echo "\n3/5  Deploy (the first time, Cloudflare asks you to choose a workers.dev subdomain)"
npx wrangler deploy

echo "\n4/5  Secret used to key hashes (generated randomly, never shown)"
openssl rand -base64 48 | tr -d '\n' | npx wrangler secret put HASH_SECRET >/dev/null && echo "HASH_SECRET set"

echo "\n5/5  Dashboard password"
if npx wrangler secret list 2>/dev/null | grep -q ADMIN_PASSWORD; then
  echo "ADMIN_PASSWORD is already set (to change it: npx wrangler secret put ADMIN_PASSWORD)"
else
  echo "Choose a password of at least 12 characters (typing is hidden). Keep it in a password manager."
  npx wrangler secret put ADMIN_PASSWORD
fi

echo "\nDone. Your backend address is the https://marcos-assistant.….workers.dev URL printed by the deploy step above."
echo "Dashboard: that address + /admin"
