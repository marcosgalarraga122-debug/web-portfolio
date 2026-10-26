#!/bin/zsh
# Run the Worker fully offline for tests: same config minus the Workers AI binding
# (the mock in chat.js answers instead, because .dev.vars sets MOCK_AI=1).
cd "${0:A:h}/.."
sed '/^\[ai\]/,/^binding = "AI"/d' wrangler.toml > .wrangler-local.toml
npx wrangler d1 migrations apply assistant --local --config .wrangler-local.toml >/dev/null
exec npx wrangler dev --config .wrangler-local.toml --port ${PORT:-8787} --ip 127.0.0.1
