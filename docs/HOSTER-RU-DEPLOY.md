# Деплой Комиссионки на Hoster.ru

Инструкция по развёртыванию проекта (Next.js + Prisma + PostgreSQL) на **Hoster.ru**.

---

## Месторасположение: СЕРВЕР

**Репозиторий, код, документация, скрипты — на сервере.** VPS Hoster.ru (83.69.248.175), каталог `~/komissionka`. Все изменения, тестирование, БД, API — в серверном контуре. `npm run dev` и отдельная dev-БД вне сервера не используются.

---

## Текущий VPS

| Параметр | Значение |
|----------|----------|
| IP | 83.69.248.175 |
| Пользователь | ubuntu |
| Подключение | `ssh ubuntu@83.69.248.175` |

Пароль ubuntu — в письме от Hoster или панели. **Сохраните в менеджере паролей. Не коммитьте в Git.**

---

## Подключение

### SSH-конфигурация

Добавьте в `~/.ssh/config`:

```
Host hoster
    HostName 83.69.248.175
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519
```

Подключение:

```bash
ssh hoster
```

Первый раз потребуется пароль. После настройки SSH-ключа — вход без пароля:
- `scripts/ssh-copy-id.ps1` — если сервер принимает пароль;
- `scripts/type-key-to-console.ps1` — эмуляция ввода в веб-консоль (когда copy-paste и curl не работают).
- **ClipAngel** — программа с горячей клавишей для эмуляции ввода из буфера обмена (см. [docs/CLIPANGEL-SETUP.md](CLIPANGEL-SETUP.md)).

**Важно:** при блокировке порта 22 подключите VPN перед `ssh hoster`.

---

## Схема деплоя

1. **База данных** — Managed PostgreSQL (если есть у Hoster) или PostgreSQL на этом же сервере. Альтернатива: внешняя БД (Timeweb, Selectel).
2. **Приложение** — Node.js, Next.js, PM2, Nginx на VPS.

---

## Шаг 1. Проверка окружения на сервере

Подключитесь и проверьте ОС:

```bash
ssh hoster
uname -a
ls -la ~
```

Должны быть ubuntu (или root) и Ubuntu (или другая Linux). Можно продолжать.

---

## Шаг 2. База данных

### Вариант А: Managed PostgreSQL у Hoster.ru

Если в панели Hoster есть Managed PostgreSQL:

1. Создайте кластер PostgreSQL.
2. Скопируйте хост, порт, логин, пароль, имя БД.
3. Строка подключения:
   ```text
   DATABASE_URL="postgresql://ЛОГИН:ПАРОЛЬ@ХОСТ:ПОРТ/ИМЯ_БД?sslmode=require"
   ```

### Вариант Б: PostgreSQL на этом же сервере

```bash
ssh hoster
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser -P komissionka   # введите пароль
sudo -u postgres createdb -O komissionka komissionka
```

Строка подключения (если БД и приложение на одном сервере):
```text
DATABASE_URL="postgresql://komissionka:ПАРОЛЬ@localhost:5432/komissionka"
```

### Вариант В: Внешняя БД (Timeweb, Selectel и т.п.)

Закажите Managed PostgreSQL у стороннего провайдера, получите строку подключения с `sslmode=require`.

---

## Шаг 3. Установка окружения на сервере

```bash
ssh hoster
```

1. Обновление и Git:

   ```bash
   sudo apt update && sudo apt install -y git
   ```

2. Node.js 20 LTS:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node -v   # v20.x.x
   ```

3. Nginx:

   ```bash
   sudo apt install -y nginx
   ```

4. PM2:

   ```bash
   sudo npm install -g pm2
   ```

---

## Шаг 4. Загрузка проекта

### Через SCP

Из каталога проекта:

```bash
scp -r . hoster:~/komissionka
```

Или с указанием полного пути:

```bash
scp -r . ubuntu@83.69.248.175:~/komissionka
```

### Через Git (если репозиторий доступен с сервера)

```bash
ssh hoster
cd ~
git clone ВАШ_РЕПОЗИТОРИЙ komissionka
cd komissionka
```

---

## Шаг 5. Сборка и переменные окружения

```bash
ssh hoster
cd ~/komissionka
```

1. Создайте `.env`:

   ```bash
   nano .env
   ```

2. Заполните (подставьте свои данные):

   ```env
   DATABASE_URL="postgresql://ЛОГИН:ПАРОЛЬ@ХОСТ:5432/ИМЯ_БД?sslmode=require"
   NEXTAUTH_SECRET="длинный-случайный-секрет-не-менее-32-символов"
   NEXTAUTH_URL="https://ваш-домен.ru"
   ```

   Или выполните: `./scripts/fix-server-images-hoster.ps1` — добавит UPLOADS_AGENT_DIR и перезапустит.

   Вручную — в `.env`:
   ```env
   UPLOADS_AGENT_DIR=/home/ubuntu/komissionka/public/uploads/agent
   ```
   (замените путь на фактический, если пользователь не ubuntu)

3. Установка, сборка и миграции:

   ```bash
   npm install
   npm run build
   npx prisma generate
   npx prisma migrate deploy
   ```

   Если `npm run build` падает с нехваткой памяти:
   ```bash
   NODE_OPTIONS=--max-old-space-size=1536 npm run build
   ```

---

## Шаг 6. Запуск приложения

```bash
cd ~/komissionka
pm2 start npm --name "komissionka" -- start
pm2 save
pm2 startup   # следуйте выведенной команде (sudo env ...)
```

Проверка:
```bash
pm2 status
curl http://127.0.0.1:3000
```

---

## Шаг 7. Nginx и SSL

1. Создайте конфиг (потребуется sudo):

   ```bash
   sudo nano /etc/nginx/sites-available/komissionka
   ```

2. Содержимое:

   ```nginx
   server {
       listen 80;
       server_name ваш-домен.ru www.ваш-домен.ru;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. Включение и перезагрузка:

   ```bash
   sudo ln -s /etc/nginx/sites-available/komissionka /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. SSL: если у Hoster есть встроенный SSL или Let's Encrypt — настройте в панели. Иначе — certbot:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru
   ```

---

## Шаг 8. Домен и загрузки

1. В панели регистратора домена добавьте A-запись на IP сервера (узнать: `curl ifconfig.me` на сервере или в панели Hoster).
2. `public/uploads`: папка создаётся при первом аплоаде; убедитесь, что процесс Node имеет права на запись.

---

## Краткая шпаргалка по командам

| Действие           | Команда                          |
|--------------------|----------------------------------|
| Подключиться       | `ssh hoster`                     |
| Загрузить проект   | `scp -r . hoster:~/komissionka`  |
| Перезапустить app  | `ssh hoster "cd ~/komissionka && pm2 restart komissionka"` |
| Логи приложения    | `ssh hoster "pm2 logs komissionka"` |

### PowerShell-скрипты

**Первый раз (полная настройка окружения):**

```powershell
.\scripts\setup-hoster.ps1
```

Выполняет: обновление SSH config → копирование ключа → установка Git/Node/Nginx/PM2 на сервере → сборка → загрузка проекта → npm install + prisma + pm2. Потребуется ввести пароль (если ключ ещё не добавлен). Если есть `.env` в рабочем репозитории, он будет скопирован на сервер.

**Дальнейшие деплои (основной путь — через GitHub):**

```powershell
.\scripts\deploy-hoster-git.ps1 -Branch main   # git push origin main → ssh hoster → scripts/deploy-from-git.sh main
```

Скрипт `deploy-from-git.sh` на сервере выполняет:

- `git fetch origin main && git reset --hard origin/main` в `~/komissionka`;
- `npm ci` (при ошибках — fallback на `npm install`);
- `npx prisma generate && npx prisma migrate deploy`;
- `npm run build` (Next.js);
- `pm2 restart komissionka agent bot`.

**Старый скрипт деплоя:**  
`.\scripts\deploy-hoster.ps1` (Build/Upload/Restart) оставлен **только как резервный вариант** (scp/rsync) на случай проблем с git-деплоем и в обычном режиме не используется.

---

## Агент ИИ на сервере

Если агент (agent/) запускается на том же VPS, где приложение, и должен вызывать API приложения — задайте в `.env` или в `agent/config.json`:

```env
AGENT_APP_URL=http://127.0.0.1:3000
```

Или если агент работает с другого хоста (вне прод-сервера):

```env
AGENT_APP_URL=http://83.69.248.175:3000
```

По умолчанию используется `http://localhost:3000`. Переменная `AGENT_APP_URL` определяет, к какому URL агент будет слать curl-запросы (admin/data, admin/news, admin/testimonials).

---

## Замечания

- **Post-quantum предупреждение SSH** — можно игнорировать, сессия при этом защищена.
- **Безопасность:** не храните `.env` в Git; при необходимости ограничьте доступ к БД по IP.
- **Миграции:** в разработочном контуре — `npx prisma migrate dev`, на сервере — только `npx prisma migrate deploy`.
