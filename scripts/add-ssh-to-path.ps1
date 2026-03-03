# Add Git's ssh to user PATH
$gitBin = "C:\Program Files\Git\usr\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$gitBin*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$gitBin", "User")
    Write-Host "Added $gitBin to user PATH. Restart PowerShell for changes to take effect."
} else {
    Write-Host "Git usr\bin already in PATH."
}
