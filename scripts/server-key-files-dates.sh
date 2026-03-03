#!/bin/bash
# Запускается на сервере: bash scripts/server-key-files-dates.sh
# Вывод — markdown-таблица.

cd "$(dirname "$0")/.." || exit 1
echo "|модуль|файл на сервере|дата/время|"
echo "|------|---------------|----------|"
for f in src/app/admin/page.tsx src/app/page.tsx src/lib/prisma.ts prisma/schema.prisma next.config.ts; do
  [ -f "$f" ] && dt=$(stat -c "%y" "$f" 2>/dev/null | cut -d. -f1) && echo "|app|$f|$dt|"
done
for f in agent/core.ts agent/serve.ts agent/config.ts agent/contract.ts agent/llm/client.ts; do
  [ -f "$f" ] && dt=$(stat -c "%y" "$f" 2>/dev/null | cut -d. -f1) && echo "|agent|$f|$dt|"
done
for f in "telegram-bot/bot.ts" "telegram-bot/what's new.md" ecosystem.config.cjs package.json version.json; do
  [ -f "$f" ] && dt=$(stat -c "%y" "$f" 2>/dev/null | cut -d. -f1) && echo "|tgbot|$f|$dt|"
done
