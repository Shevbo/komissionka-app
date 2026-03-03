# Types SSH public key into the focused window (e.g. VPS web console).
# 1. Run this script
# 2. Within 5 seconds, click on the console window to focus it
# 3. The script will type: echo 'KEY' >> ~/.ssh/authorized_keys + Enter

Add-Type -AssemblyName System.Windows.Forms

$keyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"
if (-not (Test-Path $keyPath)) {
    Write-Host "Key not found: $keyPath" -ForegroundColor Red
    exit 1
}

$key = (Get-Content $keyPath -Raw).Trim()
$cmd = "echo '$key' >> ~/.ssh/authorized_keys"

# Escape SendKeys special chars: + ^ % ~ { } [ ] ( )
$cmd = $cmd -replace '\+','{+}' -replace '\^','{^}' -replace '%','{%}' -replace '~','{~}' -replace '\[','{[}' -replace '\]','{]}' -replace '\(','{(' -replace '\)','{)}' -replace '\{','{{' -replace '\}','}}'

Write-Host "Focus the console window in 5 seconds..." -ForegroundColor Yellow
Write-Host "(click on the VPS web console)" -ForegroundColor Gray
Start-Sleep -Seconds 5

[System.Windows.Forms.SendKeys]::SendWait($cmd)
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait("chmod 600 ~/.ssh/authorized_keys")
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

Write-Host "Done." -ForegroundColor Green
