#!/bin/bash
set -euo pipefail

# env-create.sh <name> <port_app> <branch> <db_name>
# Creates a new environment: clones repo, installs deps, creates DB, configures PM2

ENV_NAME="${1:-}"
PORT_APP="${2:-}"
BRANCH="${3:-main}"
DB_NAME="${4:-}"

if [[ -z "$ENV_NAME" || -z "$PORT_APP" ]]; then
  echo "Usage: env-create.sh <name> <port_app> [branch] [db_name]"
  exit 1
fi

ENV_DIR="$HOME/komissionka-${ENV_NAME}"
DB_NAME="${DB_NAME:-komissionka_${ENV_NAME}}"
PORT_AGENT=$((PORT_APP + 100))
PORT_BOT=$((PORT_APP + 200))

echo "=== Creating environment: $ENV_NAME ==="
echo "Directory: $ENV_DIR"
echo "Ports: app=$PORT_APP, agent=$PORT_AGENT, bot=$PORT_BOT"
echo "Branch: $BRANCH"
echo "Database: $DB_NAME"

# Check if directory exists
if [[ -d "$ENV_DIR" ]]; then
  echo "ERROR: Directory $ENV_DIR already exists"
  exit 1
fi

# Clone repository
echo "[1/6] Cloning repository..."
git clone --branch "$BRANCH" https://github.com/Shevbo/komissionka-app.git "$ENV_DIR"
cd "$ENV_DIR"

# Install dependencies (with memory limit for constrained VPS)
echo "[2/6] Installing dependencies..."
export NODE_OPTIONS="--max-old-space-size=512"
npm install --prefer-offline --no-audit --no-fund || {
  echo "First npm install failed, retrying with reduced parallelism..."
  npm install --prefer-offline --no-audit --no-fund --maxsockets=2
}

# Create database
echo "[3/6] Creating database..."
sudo -u postgres createdb "$DB_NAME" 2>/dev/null || echo "Database $DB_NAME may already exist"

# Configure environment
echo "[4/6] Configuring environment..."
cp "$HOME/komissionka/.env" "$ENV_DIR/.env"
sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://komissionka:123@localhost:5432/${DB_NAME}|" "$ENV_DIR/.env"
echo "PORT=$PORT_APP" >> "$ENV_DIR/.env"
echo "AGENT_PORT=$PORT_AGENT" >> "$ENV_DIR/.env"

# Run migrations
echo "[5/6] Running Prisma migrations..."
npx prisma generate
npx prisma db push --accept-data-loss

# Build and start PM2 (keep NODE_OPTIONS for build)
echo "[6/6] Building and starting PM2 processes..."
export NODE_OPTIONS="--max-old-space-size=512"
npm run build

# Create PM2 ecosystem for this environment
cat > "$ENV_DIR/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [
    {
      name: "komissionka-${ENV_NAME}",
      script: "npm",
      args: "run start -- -p $PORT_APP",
      cwd: "${ENV_DIR}",
      max_memory_restart: "700M",
      node_args: "--max-old-space-size=512",
      env: {
        NODE_ENV: "production",
        PORT: "$PORT_APP",
        TZ: "Europe/Moscow"
      }
    },
    {
      name: "agent-${ENV_NAME}",
      script: "npx",
      args: "tsx agent/serve.ts",
      cwd: "${ENV_DIR}",
      max_memory_restart: "400M",
      node_args: "--max-old-space-size=384",
      env: {
        NODE_ENV: "production",
        PORT: "$PORT_AGENT",
        TZ: "Europe/Moscow"
      }
    },
    {
      name: "bot-${ENV_NAME}",
      script: "npx",
      args: "tsx telegram-bot/bot.ts",
      cwd: "${ENV_DIR}",
      max_memory_restart: "200M",
      node_args: "--max-old-space-size=192",
      env: {
        NODE_ENV: "production",
        TZ: "Europe/Moscow"
      }
    }
  ]
};
EOF

pm2 start "$ENV_DIR/ecosystem.config.cjs"
pm2 save

echo "=== Environment $ENV_NAME created successfully ==="
echo "App URL: http://localhost:$PORT_APP"
