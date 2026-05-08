#!/usr/bin/env bash
# MagicDash — homeserver bootstrap.
#
# Creates the host-side files and directories that docker-compose bind-mounts
# into the backend container. Run once after cloning the repo on your
# homeserver, before `docker compose up -d`.
#
#   $ ./scripts/homeserver-bootstrap.sh
#
# After the first `docker compose up -d`, open the dashboard in your browser
# and click "Demo Mode" in the first-launch wizard — the wizard will fill in
# the .env, generate a JWT secret, and create the admin user automatically.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "MagicDash bootstrap — root: $ROOT"

mkdir -p backend/data backend/logs

# Empty placeholders so Docker bind-mounts files (not directories).
[[ -f backend/users.json  ]] || echo '[]' > backend/users.json
[[ -f backend/tokens.json ]] || echo '{}' > backend/tokens.json

# Empty stub .env — the first-launch wizard will populate it. We only create
# the file so the bind mount lands on a file (not a directory).
if [[ ! -f backend/.env ]]; then
  cat > backend/.env <<'EOF'
# Empty stub — the MagicDash setup wizard will populate this on first launch.
# To skip the wizard and start in demo mode immediately, replace this file's
# contents with `cp backend/.env.demo backend/.env` and create an admin user.
EOF
  echo "  → backend/.env  empty stub created (wizard will fill it on first launch)"
fi

chmod 600 backend/.env backend/users.json backend/tokens.json 2>/dev/null || true

echo
echo "Done. Next steps:"
echo "  1. Verify the NPM network name:  docker network ls | grep -i npm"
echo "     Edit docker-compose.yml if your NPM network is not called 'npm_default'."
echo "  2. docker compose up -d"
echo "  3. In Nginx Proxy Manager, add a Proxy Host pointing"
echo "     magicdash.<your-domain> → http://magicdash-frontend:80"
echo "  4. Open https://magicdash.<your-domain> and click 'Demo Mode' in the wizard."
