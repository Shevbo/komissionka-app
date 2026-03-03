# Выполняет на сервере: setup-domain, seed-demo, (опционально swap+ecosystem), pm2 restart
# Запуск: .\scripts\run-all-server-steps.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$Domain = "http://komissionka92.ru"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

Write-Host "1. Обновление .env (APP_BASE_URL, NEXTAUTH_URL)..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && ([ -f .env ] || touch .env) && grep -v '^NEXTAUTH_URL=' .env | grep -v '^APP_BASE_URL=' | grep -v '^AGENT_APP_URL=' | grep -v '^NEXTAUTH_TRUST_HOST=' > .env.tmp; mv .env.tmp .env; echo 'NEXTAUTH_URL=$Domain' >> .env; echo 'NEXTAUTH_TRUST_HOST=true' >> .env; echo 'APP_BASE_URL=$Domain' >> .env; echo 'AGENT_APP_URL=$Domain' >> .env"

Write-Host "2. seed-demo..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && npx tsx scripts/seed-demo.ts"

Write-Host "3. pm2 restart..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && pm2 restart komissionka agent bot"

Write-Host "`nПри OOM: 1) .\scripts\setup-swap-hoster.ps1  2) .\scripts\switch-to-ecosystem-pm2.ps1" -ForegroundColor Yellow
Write-Host "Done." -ForegroundColor Green
