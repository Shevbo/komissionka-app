# Настройка Nginx для домена komissionka92.ru
# Загружает HTTP-only bootstrap (scripts/nginx-komissionka92.conf). После certbot на оба имени (-d ... -d www...)
# замените vhost на scripts/nginx-komissionka92.https.conf (см. комментарии в файле).
# Запуск: .\scripts\setup-nginx-komissionka92.ps1

$HostAlias = "hoster"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"
$ScpExe = "C:\Progra~1\Git\usr\bin\scp.exe"
Write-Host "Upload and setup Nginx for komissionka92.ru (HTTP bootstrap)..." -ForegroundColor Cyan
& $ScpExe "$PSScriptRoot\nginx-komissionka92.conf" "${HostAlias}:~/komissionka92.conf"
& $SshExe $HostAlias "sudo mv ~/komissionka92.conf /etc/nginx/sites-available/komissionka92; sudo ln -sf /etc/nginx/sites-available/komissionka92 /etc/nginx/sites-enabled/; sudo nginx -t && sudo systemctl reload nginx; echo Done"
