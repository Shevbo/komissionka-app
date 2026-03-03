# Переключает PM2 на ecosystem.config.cjs (с лимитами памяти)
# Запуск: .\scripts\switch-to-ecosystem-pm2.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

Write-Host "Switching PM2 to ecosystem.config.cjs..." -ForegroundColor Cyan
Invoke-Ssh "cd $RemotePath && pm2 delete komissionka agent bot 2>/dev/null; pm2 start ecosystem.config.cjs && pm2 save && pm2 status"
Write-Host "Done. Processes now have memory limits." -ForegroundColor Green
