# Initial setup: Komissionka on Hoster.ru VPS
# Run from project root: .\scripts\setup-hoster.ps1

$HostAlias = "hoster"
$HostName = "83.69.248.175"
$HostUser = "ubuntu"
$RemotePath = "~/komissionka"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Progra~1\Git\usr\bin\scp.exe"
$SshConfig = "$env:USERPROFILE\.ssh\config"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$ProjectRoot\package.json")) { $ProjectRoot = (Get-Location).Path }

function Write-Step { param($n, $msg) Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Invoke-Ssh { & $SshExe $HostAlias @args }
function Invoke-Scp { & $ScpExe @args }

Write-Host "=== Setup Komissionka on Hoster.ru ===" -ForegroundColor Green
Write-Host "Host: $HostUser@$HostName" -ForegroundColor Gray
Write-Host "Need: .env with DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL (or create on server after)" -ForegroundColor Gray

# --- 1. SSH config ---
Write-Step 1 "Checking SSH config..."
$configDir = Split-Path $SshConfig -Parent
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }

$hosterLines = @(
    "Host $HostAlias",
    "    HostName $HostName",
    "    User $HostUser",
    "    IdentityFile ~/.ssh/id_ed25519",
    "    StrictHostKeyChecking accept-new"
)

$lines = @(Get-Content $SshConfig -ErrorAction SilentlyContinue)
$out = @()
$i = 0
$replaced = $false
while ($i -lt $lines.Count) {
    if ($lines[$i] -match "^\s*Host\s+$HostAlias\s*$") {
        $out += $hosterLines
        $replaced = $true
        while ($i + 1 -lt $lines.Count -and $lines[$i + 1] -match "^\s+\w+") { $i++ }
    } else {
        $out += $lines[$i]
    }
    $i++
}
if (-not $replaced) { $out += ""; $out += $hosterLines }
Set-Content $SshConfig -Value $out
Write-Host "  SSH config updated." -ForegroundColor Green

# --- 2. SSH key ---
Write-Step 2 "Copying SSH key (enter password when prompted)..."
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"
if (-not (Test-Path $KeyPath)) {
    Write-Host "  Key not found. Create: ssh-keygen -t ed25519 -f `"$KeyPath`"" -ForegroundColor Red
    exit 1
}
Get-Content $KeyPath | & $SshExe "${HostUser}@${HostName}" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed. Check VPN, password." -ForegroundColor Red
    exit 1
}
Write-Host "  SSH key installed." -ForegroundColor Green

# --- 3. Server: Git, Node, Nginx, PM2 (Debian or CentOS) ---
Write-Step 3 "Installing Git, Node.js, Nginx, PM2 on server..."
$setupCmd = @'
set -e
if command -v apt-get &>/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -qq && sudo apt-get install -y -qq git
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - 2>/dev/null
  sudo apt-get install -y -qq nodejs nginx
elif command -v yum &>/dev/null; then
  yum install -y -q epel-release
  yum install -y -q git nginx
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>/dev/null
  yum install -y -q nodejs
fi
sudo npm install -g pm2 --silent
node -v && pm2 -v
'@
Invoke-Ssh $setupCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Server setup failed. Check SSH." -ForegroundColor Red
    exit 1
}
Write-Host "  Server packages installed." -ForegroundColor Green

# --- 4. Build locally ---
Write-Step 4 "Building project locally..."
Push-Location $ProjectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    Write-Host "  Build OK." -ForegroundColor Green
} catch {
    Write-Host "  Build failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# --- 5. Upload ---
Write-Step 5 "Uploading project..."
$exclude = @("node_modules", ".git", ".agent-logs", ".agent-tmp", ".agent-backup", ".cursor")
$tempDir = Join-Path $env:TEMP "komissionka-setup-$(Get-Date -Format 'yyyyMMddHHmmss')"
$tempProj = Join-Path $tempDir "komissionka"
New-Item -ItemType Directory -Path $tempProj -Force | Out-Null
Get-ChildItem -Path . -Force | Where-Object { $_.Name -notin $exclude } | ForEach-Object { Copy-Item $_.FullName -Destination $tempProj -Recurse -Force }
Invoke-Scp -r $tempProj "${HostAlias}:~/"
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Upload failed." -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  Upload OK." -ForegroundColor Green

# --- 6. .env check ---
Write-Step 6 "Checking .env..."
$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) {
    Write-Host "  Copying .env to server..." -ForegroundColor Gray
    Invoke-Scp $envPath "${HostAlias}:${RemotePath}/.env"
    Write-Host "  .env copied." -ForegroundColor Green
} else {
    Write-Host "  .env not found. Create it on server:" -ForegroundColor Yellow
    Write-Host "    ssh hoster" -ForegroundColor Gray
    Write-Host "    cd ~/komissionka && nano .env" -ForegroundColor Gray
    Write-Host "    (add DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL)" -ForegroundColor Gray
}

# --- 7. npm, prisma, pm2 on server ---
Write-Step 7 "Installing deps, Prisma, starting PM2..."
$deployCmd = "cd $RemotePath && npm install && npx prisma generate && npx prisma migrate deploy && pm2 start npm --name komissionka -- start && pm2 start npm --name agent -- run agent:serve && pm2 start npm --name bot -- run bot:start && pm2 save && sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu"
Invoke-Ssh $deployCmd
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "  Deploy on server failed. Check .env, DATABASE_URL." -ForegroundColor Red
    Write-Host "  Manual: ssh hoster, cd ~/komissionka, npm install, npx prisma migrate deploy, pm2 start npm --name komissionka -- start, pm2 start npm --name agent -- run agent:serve, pm2 start npm --name bot -- run bot:start" -ForegroundColor Gray
    exit 1
}

Write-Host "`n=== Setup complete ===" -ForegroundColor Green
Write-Host "App: http://83.69.248.175:3000" -ForegroundColor Gray
Write-Host "Next: configure Nginx + SSL (see docs/HOSTER-RU-DEPLOY.md Step 7)" -ForegroundColor Gray
Write-Host "Deploy updates: .\scripts\deploy-hoster.ps1 -All" -ForegroundColor Gray
