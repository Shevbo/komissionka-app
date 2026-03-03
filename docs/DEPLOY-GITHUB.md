# Деплой через GitHub

Все изменения деплоятся **через GitHub**: push в `main` запускает деплой на VPS. Прямая выгрузка с локальной машины на сервер не используется.

## Как это работает

1. Вы пушите изменения в репозиторий (ветка `main`).
2. GitHub Actions запускает workflow **Deploy to Hoster**.
3. Runner подключается по SSH к серверу и выполняет в `~/komissionka`:
   - `git fetch` + `git reset --hard origin/main`
   - `npm ci` → `prisma generate` → `prisma migrate deploy` → `npm run build`
   - `pm2 restart komissionka agent bot`

## Однократная настройка сервера

На VPS (hoster) один раз:

1. Если раньше деплой был через `deploy-hoster.ps1` (scp), заменить каталог на клон из Git:
   ```bash
   cd ~
   cp komissionka/.env /tmp/komissionka.env   # сохранить .env
   rm -rf komissionka
   git clone https://github.com/ВАШ_ЛОГИН/komissionka.git
   cp /tmp/komissionka.env komissionka/.env
   cd komissionka
   ```
   Иначе просто клонировать:
   ```bash
   cd ~
   git clone https://github.com/ВАШ_ЛОГИН/komissionka.git
   cd komissionka
   ```

2. Создать или скопировать `.env` в корне проекта (файл не коммитится в Git).

3. Установить зависимости и запустить:
   ```bash
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run build
   pm2 start ecosystem.config.js   # или pm2 start ... по вашей схеме
   ```

4. Настроить доступ по SSH для GitHub Actions (ключ без пароля), если ещё не настроен.

## Секреты в GitHub

В настройках репозитория: **Settings → Secrets and variables → Actions** — добавить:

| Секрет | Описание |
|--------|----------|
| `DEPLOY_HOST` | IP или hostname VPS (например `83.69.248.175` или из `~/.ssh/config`: host для `hoster`) |
| `DEPLOY_USER` | Имя пользователя SSH (например `ubuntu`) |
| `SSH_PRIVATE_KEY` | Приватный SSH-ключ (содержимое файла, без пароля) |

После добавления секретов при каждом push в `main` деплой будет запускаться автоматически. Ручной запуск: **Actions → Deploy to Hoster → Run workflow**.

Если основная ветка репозитория — `master`, в `.github/workflows/deploy.yml` замените `branches: [main]` на `branches: [master]` и в скрипте на сервере — `origin/main` на `origin/master`.

## Локальный скрипт deploy-hoster.ps1

Скрипт `scripts/deploy-hoster.ps1` больше **не используется для выгрузки кода**. Оставлен только вариант перезапуска PM2 на сервере (`-Restart`), если нужно перезапустить процессы без деплоя. Для деплоя используйте push в GitHub.
