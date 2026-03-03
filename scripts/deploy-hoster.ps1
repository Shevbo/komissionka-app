# Deploy Komissionka — деплой идёт через GitHub (push в main → GitHub Actions).
# Этот скрипт больше НЕ выгружает код с локальной машины на сервер.
# Использование: только перезапуск PM2 на сервере при необходимости.
# См. docs/DEPLOY-GITHUB.md

param(
    [switch]$Build,
    [switch]$Upload,
    [switch]$Restart,
    [switch]$All
)

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$ProjectRoot\package.json")) { $ProjectRoot = (Get-Location).Path }

function Invoke-Ssh { & $SshExe $HostAlias @args }

# Деплой кода только через GitHub. Локально разрешён только перезапуск PM2.
$doRestart = $Restart -or $All
$wantedUploadOrBuild = $Build -or $Upload

if ($wantedUploadOrBuild) {
    Write-Host "Деплой выполняется через GitHub (push в main). См. docs/DEPLOY-GITHUB.md" -ForegroundColor Yellow
    Write-Host "Локальная выгрузка и сборка для сервера отключены." -ForegroundColor Gray
    if (-not $doRestart) { exit 0 }
}

if (-not $doRestart) {
    Write-Host "Usage: .\deploy-hoster.ps1 [-Restart] [-All]" -ForegroundColor Yellow
    Write-Host "  -Restart : pm2 restart komissionka agent bot на сервере" -ForegroundColor Gray
    Write-Host "  -All     : то же (Restart)" -ForegroundColor Gray
    Write-Host "Деплой кода: push в ветку main -> GitHub Actions." -ForegroundColor Gray
    exit 0
}

Push-Location $ProjectRoot
try {
    Write-Host "`nRestarting PM2 on server..." -ForegroundColor Cyan
    Invoke-Ssh "cd $RemotePath && pm2 restart komissionka agent bot && pm2 list"
    if ($LASTEXITCODE -ne 0) { throw "Restart failed" }
    Write-Host "Done." -ForegroundColor Green
}
catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
