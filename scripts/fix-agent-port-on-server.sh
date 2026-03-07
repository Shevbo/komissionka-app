#!/bin/bash
# Однократное исправление на сервере: освободить порт 3140 для prod-агента.
# Если agent-test1 был создан с PORT_APP=3040, его AGENT_PORT=3140 конфликтует с prod.
# Запуск на сервере: bash scripts/fix-agent-port-on-server.sh

set -euo pipefail

TEST1_DIR="${HOME}/komissionka-test1"
TEST1_ENV="${TEST1_DIR}/.env"

if [[ ! -d "$TEST1_DIR" ]]; then
  echo "Каталог $TEST1_DIR не найден. Нечего исправлять."
  exit 0
fi

if [[ ! -f "$TEST1_ENV" ]]; then
  echo "Файл $TEST1_ENV не найден."
  exit 1
fi

# Установить AGENT_PORT=3141 для test1 (если было 3140)
if grep -q '^AGENT_PORT=3140$' "$TEST1_ENV" 2>/dev/null; then
  sed -i 's/^AGENT_PORT=3140$/AGENT_PORT=3141/' "$TEST1_ENV"
  echo "В $TEST1_ENV установлен AGENT_PORT=3141"
elif ! grep -q '^AGENT_PORT=' "$TEST1_ENV" 2>/dev/null; then
  echo "AGENT_PORT=3141" >> "$TEST1_ENV"
  echo "В $TEST1_ENV добавлен AGENT_PORT=3141"
else
  echo "AGENT_PORT в $TEST1_ENV уже задан (не 3140). Пропуск."
fi

# Перезапуск: сначала test1 (чтобы освободить 3140), затем prod agent
pm2 restart agent-test1 2>/dev/null || true
sleep 2
pm2 restart agent 2>/dev/null || true
echo "Готово. Проверка: curl -s http://127.0.0.1:3140/health"
