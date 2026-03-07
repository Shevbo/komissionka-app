#!/bin/bash
set -euo pipefail

# Git-based deploy on hoster: pull code from origin and restart services.
# Usage: bash scripts/deploy-from-git.sh [branch]
# Default branch: main

BRANCH="${1:-main}"
DEPLOY_START_TS=$(date +%s)
LOG_RESULT="completed"
LOG_ERROR=""

cd "$(dirname "$0")/.." || exit 1

log_append() {
  local status="$1"
  local err="$2"
  local duration_ms=$(( ( $(date +%s) - DEPLOY_START_TS ) * 1000 ))
  local out_str="Deploy $status. Commit: ${CURRENT_COMMIT:-unknown}"
  [[ -n "$err" ]] && out_str="$out_str. $err"
  out_esc=$(printf '%s' "$out_str" | sed 's/\\/\\\\/g; s/"/\\"/g')
  err_esc=$(printf '%s' "$err" | sed 's/\\/\\\\/g; s/"/\\"/g')
  if [[ -n "${DEPLOY_LOG_SECRET:-}" ]]; then
    curl -s -X POST "http://127.0.0.1:3000/api/deploy/log/append" \
      -H "x-deploy-log-secret: $DEPLOY_LOG_SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"operation\":\"deploy\",\"environment_name\":\"prod\",\"status\":\"$status\",\"output\":\"$out_esc\",\"error\":\"$err_esc\",\"duration_ms\":$duration_ms,\"requested_by\":\"deploy-from-git.sh\"}" \
      --connect-timeout 2 --max-time 5 || true
  fi
}

trap 'log_append "$LOG_RESULT" "$LOG_ERROR"' EXIT
trap 'LOG_RESULT=failed; LOG_ERROR="Deploy failed"' ERR

# Optional: load DEPLOY_LOG_SECRET from .env
if [[ -f .env ]]; then
  export DEPLOY_LOG_SECRET=$(grep -E '^DEPLOY_LOG_SECRET=' .env 2>/dev/null | cut -d= -f2- | head -1) || true
fi

echo "[deploy-from-git] Using branch: $BRANCH"

echo "[1/4] Updating code from origin/$BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
CURRENT_COMMIT="$(git rev-parse --short HEAD || echo unknown)"
echo "[deploy-from-git] Now at commit $CURRENT_COMMIT"

echo "[2/4] Installing dependencies (npm ci, fallback to npm install)..."
if ! npm ci; then
  echo "[deploy-from-git] npm ci failed, falling back to npm install..."
  LOG_ERROR="npm ci failed"
  npm install
fi
LOG_ERROR=""

echo "[3/4] Prisma generate + migrate deploy..."
npx prisma generate
npx prisma migrate deploy
# Повторная генерация Prisma после миграций — на сервере агент иногда падал с «does not provide export named PrismaClient»
npx prisma generate

echo "[4/4] Building app and restarting PM2..."
npm run build
export TZ=Europe/Moscow
pm2 restart komissionka agent bot --update-env

echo "[deploy-from-git] Done. Commit: $CURRENT_COMMIT"

