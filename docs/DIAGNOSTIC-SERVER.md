# Диагностика на сервере

## 0. Картинки не отображаются — быстрый фикс

С локального ПК:
```powershell
.\scripts\fix-server-images-hoster.ps1
```

Скрипт: добавляет UPLOADS_AGENT_DIR в .env, перезапускает pm2, проверяет health.

## 1. Проверка здоровья приложения

```bash
curl -s http://127.0.0.1:3000/api/health | jq
```

Проверьте:
- `db.ok` — должно быть `true`
- `uploadsExists` — должно быть `true` если есть картинки агента
- `cwd` — рабочая директория процесса (должна быть `~` или `/home/ubuntu`)

## 2. 404 на изображения

**Обязательно** задайте в `.env` на сервере:

```env
UPLOADS_AGENT_DIR=/home/ubuntu/komissionka/public/uploads/agent
```

(Замените `/home/ubuntu` на фактический домашний каталог пользователя, например `~` раскрывается в полный путь.)

Перезапустите приложение:
```bash
pm2 restart komissionka
```

При деплое папка `public/uploads` **исключена** — изображения агента не перезаписываются.

## 3. PM2 и перезапуск после деплоя

После изменений в коде всегда выполняйте:
```bash
cd ~/komissionka
pm2 restart komissionka agent bot
```

Или через deploy-скрипт с локального ПК:
```powershell
.\scripts\deploy-hoster.ps1 -Restart
```

## 4. Проверка БД и товаров

```bash
cd ~/komissionka
npx prisma studio --browser none
```

На сервере без GUI обязательно `--browser none`, иначе Prisma упадёт с ошибкой `xdg-open ENOENT`. Порт будет указан в выводе (например 51212). Для доступа с локального компьютера: `ssh -L 5555:localhost:51212 hoster`, затем откройте http://localhost:5555 в браузере. Проверьте `items` — есть ли записи.

## 5. Логи

```bash
pm2 logs komissionka
pm2 logs agent
```
