#!/bin/bash
set -euo pipefail

# env-deploy.sh <name> [branch]
# Deploys updates to an existing environment

ENV_NAME="${1:-}"
BRANCH="${2:-}"
DEPLOY_START_TS=$(date +%s)
LOG_RESULT="completed"
LOG_ERROR=""

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

log_append() {
  local status="$1"
  local err="$2"
  local duration_ms=$(( ( $(date +%s) - DEPLOY_START_TS ) * 1000 ))
  local out_str="Deploy $status. Env: $ENV_NAME"
  [[ -n "$err" ]] && out_str="$out_str. $err"
  out_esc=$(printf '%s' "$out_str" | sed 's/\\/\\\\/g; s/"/\\"/g')
  err_esc=$(printf '%s' "$err" | sed 's/\\/\\\\/g; s/"/\\"/g')
  if [[ -n "${DEPLOY_LOG_SECRET:-}" ]]; then
    curl -s -X POST "http://127.0.0.1:3000/api/deploy/log/append" \
      -H "x-deploy-log-secret: $DEPLOY_LOG_SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"operation\":\"deploy\",\"environment_name\":\"$ENV_NAME\",\"status\":\"$status\",\"output\":\"$out_esc\",\"error\":\"$err_esc\",\"duration_ms\":$duration_ms,\"requested_by\":\"env-deploy.sh\"}" \
      --connect-timeout 2 --max-time 5 || true
  fi
}
trap 'log_append "$LOG_RESULT" "$LOG_ERROR"' EXIT
trap 'e=$?; LOG_RESULT=failed; LOG_ERROR="Exit $e. ${BASH_COMMAND:0:150}"' ERR

# Load DEPLOY_LOG_SECRET from prod .env (app runs on prod)
if [[ -f "$HOME/komissionka/.env" ]]; then
  export DEPLOY_LOG_SECRET=$(grep -E '^DEPLOY_LOG_SECRET=' "$HOME/komissionka/.env" 2>/dev/null | cut -d= -f2- | head -1) || true
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

# Install dependencies (limit Node heap so several processes fit in RAM; clean retry)
echo "[2/5] Installing dependencies..."
export NODE_OPTIONS="--max-old-space-size=1536"
if ! npm ci --prefer-offline --no-audit 2>/dev/null; then
  echo "[env-deploy] npm ci failed, cleaning node_modules and retrying..."
  rm -rf node_modules
  if ! npm ci --prefer-offline --no-audit 2>/dev/null; then
    echo "[env-deploy] npm ci failed again, cleaning cache and trying npm install..."
    npm cache clean --force 2>/dev/null || true
    rm -rf node_modules
    LOG_ERROR="npm ci failed"
    npm install --no-audit --no-fund --prefer-offline
    LOG_ERROR=""
  fi
fi

# Run Prisma
echo "[3/5] Running Prisma migrations..."
npx prisma generate
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma migrate deploy

# Build (same heap limit to avoid OOM during Next.js build)
echo "[4/5] Building application..."
export NODE_OPTIONS="--max-old-space-size=1536"
npm run build

# Restart PM2
echo "[5/5] Restarting PM2 processes..."
if [[ "$ENV_NAME" == "prod" ]]; then
  pm2 restart komissionka agent bot deploy-worker --update-env
else
  pm2 restart "komissionka-${ENV_NAME}" "agent-${ENV_NAME}" "bot-${ENV_NAME}" 2>/dev/null || \
    pm2 start "$ENV_DIR/ecosystem.config.cjs"
fi

echo "=== Deployment to $ENV_NAME completed ==="
