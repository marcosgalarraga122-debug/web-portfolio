#!/bin/zsh
# Sets (or changes) the dashboard password. Run it yourself in Terminal:
#   ~/Projects/web-portfolio/backend/set-password.sh
# Nothing appears on screen while you type the password: that's normal. It asks twice to catch typos.
set -e
cd "${0:A:h}"
export PATH="$HOME/.local/node/bin:$PATH"

while true; do
  read -rs "pw?Dashboard password (at least 12 characters; nothing shows while you type): "; echo
  if [ ${#pw} -lt 12 ]; then echo "That was ${#pw} characters; it needs at least 12. Try again.\n"; continue; fi
  read -rs "pw2?Type it again to confirm: "; echo
  [ "$pw" = "$pw2" ] && break
  echo "The two didn't match. Try again.\n"
done
printf '%s' "$pw" | npx wrangler secret put ADMIN_PASSWORD
unset pw pw2
echo "\nPassword saved. Keep it in a password manager."
