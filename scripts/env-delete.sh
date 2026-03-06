#!/bin/bash
set -euo pipefail

# env-delete.sh <name>
# Deletes an environment: stops PM2, removes directory and database

ENV_NAME="${1:-}"

if [[ -z "$ENV_NAME" ]]; then
  echo "Usage: env-delete.sh <name>"
  exit 1
fi

if [[ "$ENV_NAME" == "prod" ]]; then
  echo "ERROR: Cannot delete production environment"
  exit 1
fi

ENV_DIR="$HOME/komissionka-${ENV_NAME}"
DB_NAME="komissionka_${ENV_NAME}"

echo "=== Deleting environment: $ENV_NAME ==="
echo "Directory: $ENV_DIR"
echo "Database: $DB_NAME"

# Stop and delete PM2 processes
echo "[1/3] Stopping PM2 processes..."
pm2 stop "komissionka-${ENV_NAME}" "agent-${ENV_NAME}" "bot-${ENV_NAME}" 2>/dev/null || true
pm2 delete "komissionka-${ENV_NAME}" "agent-${ENV_NAME}" "bot-${ENV_NAME}" 2>/dev/null || true
pm2 save

# Drop database
echo "[2/3] Dropping database..."
sudo -u postgres dropdb "$DB_NAME" 2>/dev/null || echo "Database $DB_NAME does not exist or already dropped"

# Remove directory
echo "[3/3] Removing directory..."
if [[ -d "$ENV_DIR" ]]; then
  rm -rf "$ENV_DIR"
  echo "Directory $ENV_DIR removed"
else
  echo "Directory $ENV_DIR does not exist"
fi

echo "=== Environment $ENV_NAME deleted ==="
