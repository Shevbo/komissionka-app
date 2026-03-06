#!/bin/bash

# env-status.sh
# Returns JSON status of all environments

echo "{"

# Get PM2 status
PM2_JSON=$(pm2 jlist 2>/dev/null || echo "[]")

echo "  \"pm2_processes\": $PM2_JSON,"

# List environments
echo "  \"environments\": ["

FIRST=true
for DIR in "$HOME"/komissionka "$HOME"/komissionka-*; do
  if [[ ! -d "$DIR" ]]; then
    continue
  fi

  NAME=$(basename "$DIR")
  if [[ "$NAME" == "komissionka" ]]; then
    ENV_NAME="prod"
    IS_PROD="true"
  else
    ENV_NAME="${NAME#komissionka-}"
    IS_PROD="false"
  fi

  # Get git branch
  BRANCH=""
  if [[ -d "$DIR/.git" ]]; then
    BRANCH=$(cd "$DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  fi

  # Get last commit
  COMMIT=""
  COMMIT_DATE=""
  if [[ -d "$DIR/.git" ]]; then
    COMMIT=$(cd "$DIR" && git rev-parse --short HEAD 2>/dev/null || echo "")
    COMMIT_DATE=$(cd "$DIR" && git log -1 --format="%ci" 2>/dev/null || echo "")
  fi

  # Check if .env exists
  HAS_ENV="false"
  if [[ -f "$DIR/.env" ]]; then
    HAS_ENV="true"
  fi

  # Get database name from .env
  DB_NAME=""
  if [[ -f "$DIR/.env" ]]; then
    DB_NAME=$(grep -oP 'DATABASE_URL=.*\/\K[^?]+' "$DIR/.env" 2>/dev/null || echo "")
  fi

  if [[ "$FIRST" == "true" ]]; then
    FIRST=false
  else
    echo ","
  fi

  cat << EOF
    {
      "name": "$ENV_NAME",
      "directory": "$DIR",
      "is_prod": $IS_PROD,
      "branch": "$BRANCH",
      "commit": "$COMMIT",
      "commit_date": "$COMMIT_DATE",
      "has_env": $HAS_ENV,
      "db_name": "$DB_NAME"
    }
EOF
done

echo ""
echo "  ]"
echo "}"
