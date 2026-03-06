#!/bin/bash
set -euo pipefail

# env-copy.sh <source> <target> [copy_db]
# Copies environment: code and optionally database

SOURCE_NAME="${1:-}"
TARGET_NAME="${2:-}"
COPY_DB="${3:-true}"

if [[ -z "$SOURCE_NAME" || -z "$TARGET_NAME" ]]; then
  echo "Usage: env-copy.sh <source> <target> [copy_db=true]"
  exit 1
fi

if [[ "$SOURCE_NAME" == "prod" ]]; then
  SOURCE_DIR="$HOME/komissionka"
  SOURCE_DB="komissionka_db"
else
  SOURCE_DIR="$HOME/komissionka-${SOURCE_NAME}"
  SOURCE_DB="komissionka_${SOURCE_NAME}"
fi

if [[ "$TARGET_NAME" == "prod" ]]; then
  TARGET_DIR="$HOME/komissionka"
  TARGET_DB="komissionka_db"
else
  TARGET_DIR="$HOME/komissionka-${TARGET_NAME}"
  TARGET_DB="komissionka_${TARGET_NAME}"
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "ERROR: Source directory $SOURCE_DIR does not exist"
  exit 1
fi

echo "=== Copying environment: $SOURCE_NAME -> $TARGET_NAME ==="
echo "Source: $SOURCE_DIR ($SOURCE_DB)"
echo "Target: $TARGET_DIR ($TARGET_DB)"
echo "Copy DB: $COPY_DB"

# Stop target PM2 processes if running
echo "[1/5] Stopping target PM2 processes..."
if [[ "$TARGET_NAME" == "prod" ]]; then
  pm2 stop komissionka agent bot 2>/dev/null || true
else
  pm2 stop "komissionka-${TARGET_NAME}" "agent-${TARGET_NAME}" "bot-${TARGET_NAME}" 2>/dev/null || true
fi

# Copy code
echo "[2/5] Copying code..."
if [[ -d "$TARGET_DIR" ]]; then
  # Remove old code but keep .env and uploads
  find "$TARGET_DIR" -mindepth 1 -maxdepth 1 \
    ! -name '.env' ! -name 'uploads' ! -name 'node_modules' \
    -exec rm -rf {} +
fi

rsync -a --exclude='node_modules' --exclude='.env' --exclude='uploads' --exclude='.next' \
  "$SOURCE_DIR/" "$TARGET_DIR/"

# Update .env with target database
echo "[3/5] Updating configuration..."
if [[ -f "$TARGET_DIR/.env" ]]; then
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://komissionka:123@localhost:5432/${TARGET_DB}|" "$TARGET_DIR/.env"
fi

# Copy database if requested
if [[ "$COPY_DB" == "true" ]]; then
  echo "[4/5] Copying database..."
  sudo -u postgres dropdb "$TARGET_DB" 2>/dev/null || true
  sudo -u postgres createdb "$TARGET_DB"
  sudo -u postgres pg_dump "$SOURCE_DB" | sudo -u postgres psql "$TARGET_DB"
else
  echo "[4/5] Skipping database copy"
fi

# Rebuild and restart
echo "[5/5] Building and restarting..."
cd "$TARGET_DIR"
npm ci 2>/dev/null || npm install
npx prisma generate
npm run build

if [[ "$TARGET_NAME" == "prod" ]]; then
  pm2 restart komissionka agent bot
else
  pm2 restart "komissionka-${TARGET_NAME}" "agent-${TARGET_NAME}" "bot-${TARGET_NAME}" 2>/dev/null || \
    pm2 start "$TARGET_DIR/ecosystem.config.cjs"
fi

echo "=== Copy from $SOURCE_NAME to $TARGET_NAME completed ==="
