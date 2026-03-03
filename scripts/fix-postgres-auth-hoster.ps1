# Fix PostgreSQL auth on Hoster VPS
# Run: .\scripts\fix-postgres-auth-hoster.ps1

$HostAlias = "hoster"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Progra~1\Git\usr\bin\scp.exe"
$DbUser = "komissionka"
$DbPass = "123"
$DbName = "komissionka_db"
$ScriptDir = Split-Path $PSScriptRoot -Parent

function Invoke-Ssh { & $SshExe $HostAlias @args }

Write-Host "=== Fix PostgreSQL auth on Hoster ===" -ForegroundColor Green

# Upload SQL and run
$sqlPath = Join-Path $ScriptDir "scripts\fix-postgres-auth.sql"
if (-not (Test-Path $sqlPath)) {
    Write-Host "SQL file not found: $sqlPath" -ForegroundColor Red
    exit 1
}

Write-Host "`nUploading SQL, creating user and DB..." -ForegroundColor Yellow
& $ScpExe $sqlPath "${HostAlias}:/tmp/fix-postgres-auth.sql"
if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP failed." -ForegroundColor Red
    exit 1
}

Invoke-Ssh "sudo -u postgres psql -v ON_ERROR_STOP=0 -f /tmp/fix-postgres-auth.sql"
Invoke-Ssh "sudo -u postgres psql -d $DbName -c 'GRANT ALL ON SCHEMA public TO $DbUser'"
Invoke-Ssh "rm -f /tmp/fix-postgres-auth.sql"

Write-Host "`nTesting connection..." -ForegroundColor Yellow
Invoke-Ssh "PGPASSWORD=$DbPass psql -h localhost -U $DbUser -d $DbName -tAc 'SELECT 1'"

Write-Host "`nPrisma migrate deploy..." -ForegroundColor Yellow
Invoke-Ssh "cd ~/komissionka; npx prisma migrate deploy"

Write-Host "`nRestart PM2..." -ForegroundColor Yellow
Invoke-Ssh "cd ~/komissionka; pm2 restart komissionka; pm2 status"

Write-Host "`nDone. DATABASE_URL=postgresql://${DbUser}:${DbPass}@localhost:5432/${DbName}" -ForegroundColor Green
