#!/bin/bash

# status-dump.sh — собирает максимум полезной диагностики в один файл.
# Вывод пишется в файл вида ./status-YYYYMMDD-HHMMSS.dump и кратко дублируется в stdout.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
OUT_FILE="${ROOT_DIR}/status-${TIMESTAMP}.dump"

log() {
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] $*" >> "${OUT_FILE}"
}

{
  echo "==== STATUS DUMP (${TIMESTAMP}) ===="
  echo

  echo "== ОС и время =="
  uname -a || true
  echo
  date
  echo

  echo "== Uptime и загрузка =="
  uptime || true
  echo
  echo "loadavg: $(cat /proc/loadavg 2>/dev/null || echo 'n/a')"
  echo

  echo "== Диск и память =="
  df -h || true
  echo
  free -m || true
  echo

  echo "== Каталог проекта =="
  echo "ROOT_DIR=${ROOT_DIR}"
  echo

  echo "== version.json =="
  if [ -f "${ROOT_DIR}/version.json" ]; then
    cat "${ROOT_DIR}/version.json"
  else
    echo "version.json not found"
  fi
  echo

  echo "== .env (только список переменных, без значений) =="
  if [ -f "${ROOT_DIR}/.env" ]; then
    sed -e 's/=.*$/=***hidden***'/ "${ROOT_DIR}/.env" || true
  else
    echo ".env not found"
  fi
  echo

  echo "== pm2 list =="
  pm2 list || true
  echo

  echo "== pm2 describe app/agent/bot (если есть) =="
  pm2 describe app || true
  echo
  pm2 describe agent || true
  echo
  pm2 describe bot || true
  echo

  echo "== Порты (app/agent/tgbot) =="
  ss -ltnp 2>/dev/null | grep -E '(:3000|:3140|:3141|:8080)' || ss -ltnp 2>/dev/null || true
  echo

  echo "== Процессы node/pm2 =="
  ps aux | grep -E 'node|pm2|komissionka' | grep -v grep || true
  echo

  echo "== curl health приложения (http://127.0.0.1:3000/health) =="
  curl -sS --max-time 5 http://127.0.0.1:3000/health || echo "(ошибка или нет эндпоинта)"
  echo

  echo "== curl версий (/api/version) =="
  curl -sS --max-time 5 http://127.0.0.1:3000/api/version || echo "(ошибка или нет эндпоинта)"
  echo

  echo "== Логи pm2 (app/agent/bot, по 100 строк) =="
  pm2 logs app --lines 100 --nostream 2>&1 || pm2 logs app --lines 100 2>&1 || true
  echo
  pm2 logs agent --lines 100 --nostream 2>&1 || pm2 logs agent --lines 100 2>&1 || true
  echo
  pm2 logs bot --lines 100 --nostream 2>&1 || pm2 logs bot --lines 100 2>&1 || true
  echo

  echo "== Логи deploy-worker (если есть) =="
  pm2 logs deploy-worker --lines 100 --nostream 2>&1 || pm2 logs deploy-worker --lines 100 2>&1 || true
  echo

  echo "== Размеры ключевых директорий =="
  du -sh "${ROOT_DIR}/.next" 2>/dev/null || echo ".next: n/a"
  du -sh "${ROOT_DIR}/node_modules" 2>/dev/null || echo "node_modules: n/a"
  du -sh "${ROOT_DIR}/.agent-logs" 2>/dev/null || echo ".agent-logs: n/a"
  echo

  echo "==== END OF STATUS DUMP ===="
} >> "${OUT_FILE}" 2>&1

echo "OK: ${OUT_FILE}"

