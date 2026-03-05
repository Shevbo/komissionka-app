#!/bin/bash
set -euo pipefail

# Git-based deploy on hoster: pull code from origin and restart services.
# Usage: bash scripts/deploy-from-git.sh [branch]
# Default branch: main

BRANCH="${1:-main}"

cd "$(dirname "$0")/.." || exit 1

echo "[deploy-from-git] Using branch: $BRANCH"

echo "[1/4] Updating code from origin/$BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
CURRENT_COMMIT="$(git rev-parse --short HEAD || echo unknown)"
echo "[deploy-from-git] Now at commit $CURRENT_COMMIT"

echo "[2/4] Installing dependencies (npm ci, fallback to npm install)..."
if ! npm ci; then
  echo "[deploy-from-git] npm ci failed, falling back to npm install..."
  npm install
fi

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

