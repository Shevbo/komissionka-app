# Deploy Komissionka to Hoster.ru VPS
# Sync skips unchanged files: uses rsync (PATH/WSL/Chocolatey) or incremental scp.
# Install rsync for faster deploys: choco install rsync
# Run from project root: .\scripts\deploy-hoster.ps1
#
# Копируется ВСЁ для модели ИИ: docs/, docs/manual/, scripts/, agent/, telegram-bot/,
# .cursor/rules/, prisma/, src/, конфиги. Исключено только: node_modules, .git, .next,
# .env*, public/uploads, временные каталоги агента (.agent-*).

param(
    [switch]$Build,
    [switch]$Upload,
    [switch]$Restart,
    [switch]$All
)

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Progra~1\Git\usr\bin\scp.exe"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$ProjectRoot\package.json")) { $ProjectRoot = (Get-Location).Path }

$ExcludeDirs = @("node_modules", ".git", ".next", ".agent-logs", ".agent-tmp", ".agent-backup", ".env", ".env.local")
$ExcludeForSync = $ExcludeDirs + "public/uploads"

function Invoke-Ssh { & $SshExe $HostAlias @args }
function Invoke-Scp { & $ScpExe @args }

$doBuild = $Build -or $All
$doUpload = $Upload -or $All
$doRestart = $Restart -or $All

if (-not ($doBuild -or $doUpload -or $doRestart)) {
    Write-Host "Usage: .\deploy-hoster.ps1 [-Build] [-Upload] [-Restart] [-All]" -ForegroundColor Yellow
    Write-Host "  -Build   : npm run build locally" -ForegroundColor Gray
    Write-Host "  -Upload  : sync project (skips unchanged files) to hoster:~/komissionka" -ForegroundColor Gray
    Write-Host "  -Restart : pm2 restart on server" -ForegroundColor Gray
    Write-Host "  -All     : Build + Upload + Restart" -ForegroundColor Gray
    exit 0
}

# Resolve rsync: PATH, WSL, Chocolatey
function Get-RsyncCommand {
    # Native rsync in PATH (e.g. from choco install rsync)
    $rsync = Get-Command rsync -ErrorAction SilentlyContinue
    if ($rsync) { return @("rsync", $rsync.Source) }

    # Chocolatey path
    $chocoRsync = "C:\ProgramData\chocolatey\bin\rsync.exe"
    if (Test-Path $chocoRsync) { return @("rsync", $chocoRsync) }

    # WSL rsync
    $wsl = Get-Command wsl -ErrorAction SilentlyContinue
    if ($wsl) {
        $check = wsl -e which rsync 2>$null
        if ($LASTEXITCODE -eq 0) { return @("wsl", "rsync") }
    }
    return $null
}

# Full scp fallback when rsync/incremental unavailable or fails
function Invoke-FullScp {
    Write-Host "Using full scp (all files)..." -ForegroundColor Gray
    $tempDir = Join-Path $env:TEMP "komissionka-deploy-$(Get-Date -Format 'yyyyMMddHHmmss')"
    $tempProj = Join-Path $tempDir "komissionka"
    New-Item -ItemType Directory -Path $tempProj -Force | Out-Null
    Get-ChildItem -Path . -Force | Where-Object { $_.Name -notin $ExcludeDirs } | ForEach-Object {
        Copy-Item $_.FullName -Destination $tempProj -Recurse -Force
    }
    Invoke-Scp -r $tempProj "${HostAlias}:~/"
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }
}

# Incremental sync via PowerShell: compare sizes, upload only changed
function Invoke-IncrementalSync {
    Write-Host "Using incremental sync (size-based, skips unchanged files)..." -ForegroundColor Gray

    $maxRetries = 3
    $relPathBase = (Resolve-Path .).Path.TrimEnd('\').Length + 1

    $getLocalFiles = {
        Get-ChildItem -Path . -Recurse -File -Force | Where-Object {
            $rel = $_.FullName.Substring($relPathBase)
            $skip = $false
            foreach ($ex in $ExcludeDirs) {
                if ($rel -like "$ex\*" -or $rel -like "$ex") { $skip = $true; break }
            }
            if ($rel -like "public\uploads\*") { $skip = $true }
            -not $skip
        } | ForEach-Object {
            $rel = $_.FullName.Substring($relPathBase).Replace('\', '/')
            [PSCustomObject]@{ Path = $rel; Size = $_.Length }
        }
    }

    $localFiles = & $getLocalFiles
    $localMap = @{}
    foreach ($f in $localFiles) { $localMap[$f.Path] = $f.Size }

    # Remote manifest via find
    $findExcludes = ($ExcludeDirs + "public/uploads") | ForEach-Object {
        "!", "-path", "./$_/*", "!", "-path", "./$_"
    }
    $findCmd = "cd $RemotePath 2>/dev/null && find . -type f $($findExcludes -join ' ') -printf '%P %s\n' 2>/dev/null"
    $remoteOut = Invoke-Ssh $findCmd 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $remoteOut) {
        Write-Host "Could not get remote file list (find -printf may be unsupported)." -ForegroundColor Yellow
        return $false
    }

    $remoteMap = @{}
    foreach ($line in ($remoteOut -split "`n")) {
        $line = $line.Trim()
        if (-not $line) { continue }
        $parts = $line -split '\s+', 2
        if ($parts.Length -ge 2) {
            $remoteMap[$parts[0]] = [long]$parts[1]
        }
    }

    $toUpload = @()
    foreach ($path in $localMap.Keys) {
        $localSize = $localMap[$path]
        $remoteSize = $remoteMap[$path]
        if ($null -eq $remoteSize -or $remoteSize -ne $localSize) {
            $toUpload += $path
        }
    }

    $total = $toUpload.Count
    if ($total -eq 0) {
        Write-Host "All files up to date, nothing to upload." -ForegroundColor Green
        return $true
    }
    Write-Host "Uploading $total changed file(s)..." -ForegroundColor Gray

    $uploaded = 0
    foreach ($path in $toUpload) {
        $fullPath = Join-Path $ProjectRoot $path.Replace('/', '\')
        if (-not (Test-Path $fullPath -PathType Leaf)) { continue }

        $remoteDir = Split-Path $path -Parent
        $remoteDir = $remoteDir.Replace('\', '/')
        $remoteFile = "$RemotePath/$path"

        for ($r = 0; $r -lt $maxRetries; $r++) {
            if ($remoteDir) {
                $mkdir = "mkdir -p $RemotePath/$remoteDir"
                Invoke-Ssh $mkdir 2>$null | Out-Null
            }
            Invoke-Scp $fullPath "${HostAlias}:${remoteFile}" 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $uploaded++
                if ($uploaded % 50 -eq 0 -or $uploaded -eq $total) {
                    Write-Host "  $uploaded / $total" -ForegroundColor Gray
                }
                break
            }
            if ($r -lt $maxRetries - 1) {
                Start-Sleep -Seconds 2
            }
            else {
                Write-Host "Failed after $maxRetries retries: $path" -ForegroundColor Red
                throw "Upload failed: $path"
            }
        }
    }
    Write-Host "Uploaded $uploaded file(s)." -ForegroundColor Green
    return $true
}

Push-Location $ProjectRoot
try {
    if ($doBuild) {
        Write-Host "`n[1/3] Building..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    }

    if ($doUpload) {
        Write-Host "`n[2/3] Syncing to ${HostAlias}:${RemotePath} (skipping unchanged files)..." -ForegroundColor Cyan

        $rsyncInfo = Get-RsyncCommand
        if ($rsyncInfo) {
            $mode = $rsyncInfo[0]
            $excludeArgs = $ExcludeForSync | ForEach-Object { "--exclude=$_" }

            if ($mode -eq "wsl") {
                $wslPath = ($ProjectRoot -replace '\\', '/') -replace '^([A-Za-z]):', { '/mnt/' + $_.Groups[1].Value.ToLower() }
                Write-Host "Using WSL rsync (skips unchanged files)..." -ForegroundColor Gray
                wsl -e rsync -avz --no-perms -e ssh $excludeArgs "${wslPath}/" "${HostAlias}:${RemotePath}/"
            }
            else {
                $exe = $rsyncInfo[1]
                Write-Host "Using rsync (skips unchanged files)..." -ForegroundColor Gray
                & $exe -avz --no-perms -e ssh $excludeArgs "./", "${HostAlias}:${RemotePath}/"
            }
            if ($LASTEXITCODE -ne 0) { throw "rsync failed" }
        }
        else {
            $ok = $false
            try {
                $ok = Invoke-IncrementalSync
            } catch {
                Write-Host "Incremental sync failed: $_" -ForegroundColor Yellow
            }
            if (-not $ok) {
                Write-Host "Falling back to full scp..." -ForegroundColor Yellow
                Invoke-FullScp
            }
        }

        Write-Host "Sync done." -ForegroundColor Gray
    }

    if ($doRestart) {
        Write-Host "`n[3/3] Restarting PM2 on server..." -ForegroundColor Cyan
        Invoke-Ssh "cd $RemotePath && npm install && npx prisma generate && npx prisma migrate deploy && npm run build && pm2 restart komissionka agent bot"
        if ($LASTEXITCODE -ne 0) { throw "Restart failed" }
        Write-Host "Done." -ForegroundColor Green
    }

    Write-Host "`nDeploy complete." -ForegroundColor Green
}
catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
