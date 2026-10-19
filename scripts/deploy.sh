#!/bin/sh
# Deploy main to production: pull on the server, install server deps if they
# changed, restart the pm2 process. The client build is committed, so nothing
# is built on the server. Usage: sh scripts/deploy.sh
set -e

HOST=root@146.190.112.221
KEY=~/.ssh/all.servers
PM2_NAME=cold-email

# Refuse to deploy local work that isn't on origin/main.
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Local HEAD differs from origin/main — push (or pull) first." >&2
  exit 1
fi

ssh -i "$KEY" "$HOST" PM2_NAME="$PM2_NAME" 'sh -s' <<'REMOTE'
set -e
# Locate the repo from the pm2 process's working directory.
CWD=$(pm2 jlist | node -e "
  const p = JSON.parse(require('fs').readFileSync(0)).find(x => x.name === process.env.PM2_NAME)
  if (!p) process.exit(1)
  console.log(p.pm2_env.pm_cwd)
") || { echo "pm2 process '$PM2_NAME' not found" >&2; exit 1; }
cd "$(git -C "$CWD" rev-parse --show-toplevel)"
echo "→ repo: $(pwd)"

BEFORE=$(git rev-parse HEAD)
git pull --ff-only origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "→ already up to date ($AFTER)"
else
  git log --oneline "$BEFORE..$AFTER"
  if git diff --name-only "$BEFORE" "$AFTER" | grep -q '^server/package'; then
    echo "→ server deps changed, installing"
    (cd server && npm ci --omit=dev)
  fi
fi

pm2 restart "$PM2_NAME" --update-env
sleep 3
pm2 ls | grep -E "name|$PM2_NAME"
pm2 logs "$PM2_NAME" --lines 20 --nostream
REMOTE
