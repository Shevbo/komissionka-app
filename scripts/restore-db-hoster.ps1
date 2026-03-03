# Полное восстановление БД на сервере: админ + демо-данные
# Выполняет ensure-admin, seed-demo, перезапуск pm2
# Запуск: .\scripts\restore-db-hoster.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

Write-Host "1. Ensure admin bshevelev@mail.ru..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && npx tsx scripts/ensure-admin.ts"
if ($LASTEXITCODE -ne 0) { Write-Host "ensure:admin failed" -ForegroundColor Red; exit 1 }

Write-Host "`n2. Seed demo (items, news, testimonials)..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && npx tsx scripts/seed-demo.ts"
if ($LASTEXITCODE -ne 0) { Write-Host "seed:demo failed" -ForegroundColor Red; exit 1 }

Write-Host "`n3. Restart pm2..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && pm2 restart komissionka agent bot"
Write-Host "`nDone. Проверьте https://komissionka92.ru" -ForegroundColor Green
