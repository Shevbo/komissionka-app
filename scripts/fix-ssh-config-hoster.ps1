# Fix SSH config: hoster -> User ubuntu
# Run: .\scripts\fix-ssh-config-hoster.ps1

$SshConfig = "$env:USERPROFILE\.ssh\config"
$HostAlias = "hoster"
$HostName = "83.69.248.175"
$HostUser = "ubuntu"

$hosterLines = @(
    "Host $HostAlias",
    "    HostName $HostName",
    "    User $HostUser",
    "    IdentityFile ~/.ssh/id_ed25519",
    "    StrictHostKeyChecking accept-new"
)

$configDir = Split-Path $SshConfig -Parent
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

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

if (-not $replaced) {
    $out += ""
    $out += $hosterLines
}

Set-Content $SshConfig -Value $out
Write-Host "SSH config updated: hoster -> $HostUser@$HostName" -ForegroundColor Green
