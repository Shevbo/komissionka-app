# Что нужно сделать на сервере (картинки в админке)
# Запуск: .\scripts\fix-server-images-hoster.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
if (-not (Test-Path $SshExe)) { $SshExe = "ssh" }

$bashScript = @'
cd ~/komissionka || exit 1
HOME_DIR=$(eval echo ~)
UPLOADS_DIR="${HOME_DIR}/komissionka/public/uploads/agent"
ENV_LINE="UPLOADS_AGENT_DIR=${UPLOADS_DIR}"

if [ -f .env ]; then
  if grep -q "UPLOADS_AGENT_DIR=" .env; then
    echo "[fix] UPLOADS_AGENT_DIR уже есть в .env"
  else
    echo "" >> .env
    echo "# Картинки агента (fix-server-images)" >> .env
    echo "$ENV_LINE" >> .env
    echo "[fix] Добавлен UPLOADS_AGENT_DIR в .env"
  fi
else
  echo "UPLOADS_AGENT_DIR=$UPLOADS_DIR" > .env
  echo "[fix] Создан .env с UPLOADS_AGENT_DIR"
fi

mkdir -p public/uploads/agent
echo "[fix] pm2 restart komissionka agent bot"
pm2 restart komissionka agent bot 2>/dev/null || pm2 restart all 2>/dev/null || true

sleep 2
echo "[fix] Проверка /api/health:"
curl -s http://127.0.0.1:3000/api/health 2>/dev/null | head -c 500
echo ""
'@

Write-Host "Выполняю на сервере: UPLOADS_AGENT_DIR, pm2 restart, health check" -ForegroundColor Cyan
$bashScript | & $SshExe $HostAlias "bash -s"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Ошибка. Проверьте: ssh $HostAlias" -ForegroundColor Red
  exit 1
}
Write-Host "`nГотово." -ForegroundColor Green
