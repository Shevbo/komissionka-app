# OOM (Out of Memory) — решение

Если `next-server` убит OOM killer, VPS не хватает RAM.

## 1. Swap (разовая настройка)

```bash
# На сервере
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # проверить
```

Или: `.\scripts\setup-swap-hoster.ps1`

## 2. Лимиты памяти (уже в проекте)

- `package.json` — `npm run start` с `NODE_OPTIONS=--max-old-space-size=512`
- `ecosystem.config.cjs` — PM2 с `max_memory_restart` и лимитами на каждый процесс

## 3. Переключение на ecosystem

```bash
cd ~/komissionka
pm2 delete komissionka agent bot 2>/dev/null
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

Или: `.\scripts\switch-to-ecosystem-pm2.ps1`

## 4. Рекомендации по тарифу VPS

Для стабильной работы: минимум **2 GB RAM** или 1 GB + 2 GB swap.
