# Архивирование локального проекта и остановка локальной PostgreSQL
# Создаёт папку ARCHIVE, перемещает туда текущий проект, останавливает локальную БД
# Запуск: .\scripts\archive-local-and-stop-db.ps1
# ВНИМАНИЕ: выполняется в каталоге родителя workspace (c:\komissionka -> c:\)

$ProjectDir = "c:\komissionka"
$ArchiveRoot = "c:\ARCHIVE"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ArchiveDir = Join-Path $ArchiveRoot "komissionka_$Timestamp"

if (-not (Test-Path $ProjectDir)) {
    Write-Host "Проект не найден: $ProjectDir" -ForegroundColor Red
    exit 1
}

Write-Host "1. Создание архива $ArchiveDir..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
# Копируем без node_modules, .next, .git для экономии места
$exclude = @("node_modules", ".next", ".git", "*.log")
Get-ChildItem $ProjectDir -Force | Where-Object {
    $name = $_.Name
    -not ($exclude | Where-Object { $name -like $_ })
} | ForEach-Object {
    Copy-Item $_.FullName -Destination $ArchiveDir -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "   Скопировано в $ArchiveDir" -ForegroundColor Gray

Write-Host "`n2. Остановка локальной PostgreSQL..." -ForegroundColor Cyan
# Windows: pg_ctl или сервис
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($pgService) {
    Stop-Service $pgService -Force -ErrorAction SilentlyContinue
    Write-Host "   Служба PostgreSQL остановлена." -ForegroundColor Gray
} else {
    # Попробуем pg_ctl
    $pgPaths = @(
        "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_ctl.exe",
        "C:\Program Files\PostgreSQL\14\bin\pg_ctl.exe"
    )
    foreach ($pgCtl in $pgPaths) {
        if (Test-Path $pgCtl) {
            $dataDir = Split-Path (Split-Path $pgCtl) -Parent
            $dataDir = Join-Path $dataDir "data"
            if (Test-Path $dataDir) {
                & $pgCtl -D $dataDir stop -m fast 2>$null
                Write-Host "   pg_ctl stop выполнен." -ForegroundColor Gray
                break
            }
        }
    }
}
Write-Host "`nГотово. Проект в ARCHIVE, БД остановлена." -ForegroundColor Green
Write-Host "Для ручного запуска PostgreSQL: запустите службу postgresql в services.msc" -ForegroundColor Yellow
