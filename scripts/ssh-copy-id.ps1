# Copy SSH key to server. Run: .\ssh-copy-id.ps1
# Requires VPN if port 22 is blocked

$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"
$HostUser = "ubuntu"
$HostName = "83.69.248.175"
$SshExe = "C:\Progra~1\Git\usr\bin\ssh.exe"

if (-not (Test-Path $KeyPath)) {
    Write-Host "Key not found: $KeyPath" -ForegroundColor Red
    Write-Host "Create key: ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519 -N '""'" -ForegroundColor Yellow
    exit 1
}

Write-Host "Copying key to ${HostUser}@${HostName}..." -ForegroundColor Cyan
Write-Host "Enter password (once, then no more):" -ForegroundColor Yellow

Get-Content $KeyPath | & $SshExe "${HostUser}@${HostName}" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Connect without password: ssh ${HostUser}@${HostName}" -ForegroundColor Green
} else {
    Write-Host "Error. Check: VPN on, correct password." -ForegroundColor Red
    exit 1
}
