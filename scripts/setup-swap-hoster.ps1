# Добавляет 2GB swap на сервере для предотвращения OOM
# Запуск: .\scripts\setup-swap-hoster.ps1
# Требует root/sudo на сервере

$HostAlias = "hoster"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

function Invoke-Ssh { & $SshExe $HostAlias @args }

$bash = @'
if [ -f /swapfile ]; then
  echo "Swap already exists: $(swapon --show)"
  exit 0
fi
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo "Swap added: $(swapon --show)"
free -h
'@

Write-Host "Adding 2GB swap on server..." -ForegroundColor Cyan
$bash | Invoke-Ssh "bash -s"
Write-Host "Done." -ForegroundColor Green
