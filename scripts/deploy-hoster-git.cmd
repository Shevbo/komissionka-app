@echo off
setlocal

REM Wrapper to avoid PowerShell script execution policy issues.
REM Usage:
REM   scripts\deploy-hoster-git.cmd [branch]
REM Default branch: main

set "BRANCH=%~1"
if "%BRANCH%"=="" set "BRANCH=main"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& { param([string]$Branch='main') Set-Location '%~dp0..'; & '%~dp0deploy-hoster-git.ps1' -Branch $Branch }" ^
  -Branch "%BRANCH%"

exit /b %errorlevel%

