param(
    [string]$Branch = "main"
)

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$ProjectRoot\package.json")) { $ProjectRoot = (Get-Location).Path }

Push-Location $ProjectRoot
try {
    Write-Host "[deploy-hoster-git] Project root: $ProjectRoot" -ForegroundColor Gray

    # 1) Проверка чистоты рабочего дерева
    $status = git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "git status failed"
    }
    if ($status.Trim().Length -ne 0) {
        Write-Host "Рабочее дерево не чистое. Закоммитьте или откатите изменения перед деплоем." -ForegroundColor Red
        Write-Host $status -ForegroundColor Yellow
        exit 1
    }

    # 2) Получаем текущий коммит
    $commit = git rev-parse --short HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "git rev-parse failed"
    }
    Write-Host "[1/2] Pushing commit $commit to origin/$Branch..." -ForegroundColor Cyan

    git push origin $Branch
    if ($LASTEXITCODE -ne 0) {
        throw "git push origin $Branch failed"
    }

    # 3) Запускаем серверный скрипт deploy-from-git.sh
    Write-Host "[2/2] Running deploy-from-git.sh on $HostAlias..." -ForegroundColor Cyan
    $cmd = "cd $RemotePath && bash scripts/deploy-from-git.sh $Branch"
    ssh $HostAlias $cmd
    if ($LASTEXITCODE -ne 0) {
        throw "Remote deploy-from-git.sh failed"
    }

    Write-Host "Deploy from git completed successfully. Commit: $commit" -ForegroundColor Green
}
catch {
    Write-Host "`nError in deploy-hoster-git.ps1: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}

