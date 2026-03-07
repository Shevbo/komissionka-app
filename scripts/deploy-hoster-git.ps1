param(
    [string]$Branch = "main",
    # Целевая среда: "prod" (по умолчанию) или имя тестовой среды (test1, test2...)
    [string]$Env = "prod",
    # Если true — деплой разрешён даже при неком чистом рабочем дереве (НЕ рекомендуется).
    [switch]$AllowDirty = $false,
    # Игнорируем изменения/неотслеживаемые файлы Cursor (.cursor/...), чтобы они не блокировали деплой.
    [switch]$IgnoreCursor = $true
)

$HostAlias = "hoster"
$RemotePath = if ($Env -eq "prod") { "~/komissionka" } else { "~/komissionka-$Env" }
$ApiUrl = "http://83.69.248.175:3000/api/deploy"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$ProjectRoot\package.json")) { $ProjectRoot = (Get-Location).Path }

Push-Location $ProjectRoot
try {
    Write-Host "[deploy-hoster-git] Project root: $ProjectRoot" -ForegroundColor Gray
    Write-Host "[deploy-hoster-git] Target environment: $Env" -ForegroundColor Gray

    # 1) Проверка чистоты рабочего дерева
    $status = git status --porcelain --untracked-files=all
    if ($LASTEXITCODE -ne 0) {
        throw "git status failed"
    }
    $statusText = if ($null -eq $status) { "" } else { ($status -join "`n").Trim() }
    if ($statusText.Length -ne 0 -and -not $AllowDirty) {
        $lines = $statusText -split "`n" | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ -ne "" }
        if ($IgnoreCursor) {
            $lines = $lines | Where-Object { $_ -notmatch "^\S{2}\s+\.cursor/" }
        }
        if ($lines.Count -gt 0) {
            Write-Host "Рабочее дерево не чистое. Закоммитьте или откатите изменения перед деплоем." -ForegroundColor Red
            Write-Host ($lines -join "`n") -ForegroundColor Yellow
            exit 1
        }
        Write-Host "⚠️ Замечание: есть изменения только в .cursor/ (игнорируем и продолжаем деплой)." -ForegroundColor Yellow
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

    # 3) Деплой только через очередь (worker). Прямой SSH отключён.
    Write-Host "[2/2] Adding deploy to queue via API (worker will run env-deploy.sh for $Env)..." -ForegroundColor Cyan
    $body = @{
        environment_name = $Env
        operation = "deploy"
        branch = $Branch
        requested_by = "deploy-hoster-git.ps1"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$ApiUrl/queue" -Method POST -ContentType "application/json" -Body $body
    if (-not $response.ok) {
        throw "API returned error: $($response.error)"
    }
    Write-Host "Deploy queued successfully. Queue ID: $($response.id). Worker obrabotaet ochered za 1-5 min (prod)." -ForegroundColor Green

    Write-Host "Deploy to $Env completed. Commit: $commit" -ForegroundColor Green
}
catch {
    Write-Host ""; Write-Host "Error in deploy-hoster-git.ps1:" $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}

