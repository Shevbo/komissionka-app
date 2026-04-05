# Настройка приложения на домен https://komissionka92.ru
# Обновляет .env на сервере: NEXTAUTH_URL, APP_BASE_URL, AGENT_APP_URL, AUTH_TRUST_HOST (NextAuth за nginx)
# Запуск: .\scripts\setup-domain-komissionka92.ps1

$HostAlias = "hoster"
$RemotePath = "~/komissionka"
# Канонический URL — https без www (совпадает с редиректом в nginx-komissionka92.https.conf)
$Domain = "https://komissionka92.ru"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

$envBlock = @"
# Обновлено скриптом setup-domain-komissionka92.ps1
NEXTAUTH_URL=$Domain
APP_BASE_URL=$Domain
AGENT_APP_URL=$Domain
AUTH_TRUST_HOST=true
"@

Write-Host "Обновление переменных на сервере для $Domain..." -ForegroundColor Cyan
# AUTH_TRUST_HOST — переменная, которую читает next-auth за reverse-proxy (не NEXTAUTH_TRUST_HOST).
Invoke-Ssh "cd $RemotePath && ([ -f .env ] || touch .env) && grep -v '^NEXTAUTH_URL=' .env | grep -v '^APP_BASE_URL=' .env | grep -v '^AGENT_APP_URL=' .env | grep -v '^AUTH_TRUST_HOST=' .env | grep -v '^NEXTAUTH_TRUST_HOST=' .env > .env.tmp; mv .env.tmp .env; echo 'NEXTAUTH_URL=$Domain' >> .env; echo 'AUTH_TRUST_HOST=true' >> .env; echo 'APP_BASE_URL=$Domain' >> .env; echo 'AGENT_APP_URL=$Domain' >> .env; echo 'Done:'; grep -E '^(NEXTAUTH_URL|APP_BASE_URL|AGENT_APP_URL|AUTH_TRUST_HOST)=' .env"
Write-Host "Done. Restart pm2: .\scripts\deploy-hoster.ps1 -Restart" -ForegroundColor Green
