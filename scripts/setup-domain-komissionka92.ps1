# Настройка приложения на домен https://komissionka92.ru
# Обновляет .env на сервере: NEXTAUTH_URL, APP_BASE_URL, AGENT_APP_URL
# Запуск: .\scripts\setup-domain-komissionka92.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
# HTTP пока нет SSL. После certbot сменить на https
$Domain = "http://komissionka92.ru"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

$envBlock = @"
# Обновлено скриптом setup-domain-komissionka92.ps1
NEXTAUTH_URL=$Domain
APP_BASE_URL=$Domain
AGENT_APP_URL=$Domain
"@

Write-Host "Обновление переменных на сервере для $Domain..." -ForegroundColor Cyan
# Добавляем/обновляем переменные в .env (не перезаписываем весь файл - DATABASE_URL и др. сохраняются)
Invoke-Ssh "cd $RemotePath && ([ -f .env ] || touch .env) && grep -v '^NEXTAUTH_URL=' .env | grep -v '^APP_BASE_URL=' | grep -v '^AGENT_APP_URL=' | grep -v '^NEXTAUTH_TRUST_HOST=' > .env.tmp; mv .env.tmp .env; echo 'NEXTAUTH_URL=$Domain' >> .env; echo 'NEXTAUTH_TRUST_HOST=true' >> .env; echo 'APP_BASE_URL=$Domain' >> .env; echo 'AGENT_APP_URL=$Domain' >> .env; echo 'Done:'; grep -E '^(NEXTAUTH_|APP_BASE_URL|AGENT_APP_URL)=' .env"
Write-Host "Done. Restart pm2: .\scripts\deploy-hoster.ps1 -Restart" -ForegroundColor Green
