#!/bin/bash
set -euo pipefail

# env-deploy.sh <name> [branch]
# Deploys updates to an existing environment

ENV_NAME="${1:-}"
BRANCH="${2:-}"

if [[ -z "$ENV_NAME" ]]; then
  echo "Usage: env-deploy.sh <name> [branch]"
  exit 1
fi

if [[ "$ENV_NAME" == "prod" ]]; then
  ENV_DIR="$HOME/komissionka"
else
  ENV_DIR="$HOME/komissionka-${ENV_NAME}"
fi

if [[ ! -d "$ENV_DIR" ]]; then
  echo "ERROR: Directory $ENV_DIR does not exist"
  exit 1
fi

cd "$ENV_DIR"

echo "=== Deploying to environment: $ENV_NAME ==="
echo "Directory: $ENV_DIR"

# Fetch and reset
echo "[1/5] Fetching latest changes..."
git fetch origin

if [[ -n "$BRANCH" ]]; then
  echo "Switching to branch: $BRANCH"
  git checkout "$BRANCH" || git checkout -b "$BRANCH" "origin/$BRANCH"
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Resetting to origin/$CURRENT_BRANCH..."
git reset --hard "origin/$CURRENT_BRANCH"

# Install dependencies
echo "[2/5] Installing dependencies..."
npm ci 2>/dev/null || npm install

# Run Prisma
echo "[3/5] Running Prisma migrations..."
npx prisma generate
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma migrate deploy

# Build
echo "[4/5] Building application..."
npm run build

# Restart PM2
echo "[5/5] Restarting PM2 processes..."
if [[ "$ENV_NAME" == "prod" ]]; then
  pm2 restart komissionka agent bot
else
  pm2 restart "komissionka-${ENV_NAME}" "agent-${ENV_NAME}" "bot-${ENV_NAME}" 2>/dev/null || \
    pm2 start "$ENV_DIR/ecosystem.config.cjs"
fi

echo "=== Deployment to $ENV_NAME completed ==="
