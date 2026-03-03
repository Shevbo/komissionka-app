# Setup PostgreSQL on Hoster VPS (Ubuntu)
# Run: .\scripts\setup-postgres-hoster.ps1

$HostAlias = "hoster"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
$DbUser = "komissionka"
$DbPass = "123"
$DbName = "komissionka_db"

function Invoke-Ssh { & $SshExe $HostAlias @args }

Write-Host "=== Setup PostgreSQL on Hoster ===" -ForegroundColor Green

$setupCmd = @"
sudo apt update -qq
sudo apt install -y -qq postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo -u postgres psql -c "CREATE USER $DbUser WITH PASSWORD '$DbPass';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DbName OWNER $DbUser;" 2>/dev/null || true
echo "PostgreSQL ready"
"@

Invoke-Ssh $setupCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Setup failed." -ForegroundColor Red
    exit 1
}

Write-Host "PostgreSQL installed. DATABASE_URL:" -ForegroundColor Green
Write-Host "postgresql://$DbUser`:$DbPass@localhost:5432/$DbName" -ForegroundColor Gray
Write-Host "`nUpdate .env and run setup-hoster.ps1 again, or:" -ForegroundColor Yellow
Write-Host "ssh hoster" -ForegroundColor Gray
Write-Host "cd ~/komissionka && npm install && npx prisma generate && npx prisma migrate deploy && pm2 restart komissionka" -ForegroundColor Gray
