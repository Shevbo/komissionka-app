#!/bin/bash
# Run on the VPS (e.g. in ~/komissionka) to pull and deploy.
# Used by GitHub Actions; can also be run manually after SSH.
set -e
cd ~/komissionka
git fetch origin
git reset --hard origin/main
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart komissionka agent bot
pm2 list
