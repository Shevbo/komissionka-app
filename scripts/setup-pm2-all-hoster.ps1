# Добавить агент и бота в PM2 на Hoster (если ещё не запущены)
# Запуск: .\scripts\setup-pm2-all-hoster.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

Write-Host "=== PM2: app + agent + bot on Hoster ===" -ForegroundColor Green

$cmd = @"
cd $RemotePath
pm2 describe agent >/dev/null 2>&1 && pm2 restart agent || pm2 start npm --name agent -- run agent:serve
pm2 describe bot >/dev/null 2>&1 && pm2 restart bot || pm2 start npm --name bot -- run bot:start
pm2 save
pm2 status
"@

Invoke-Ssh $cmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed." -ForegroundColor Red
    exit 1
}

Write-Host "`nDone. Agent: 127.0.0.1:3140 (internal), Bot: running" -ForegroundColor Green
