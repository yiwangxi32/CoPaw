@echo off
setlocal

set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "ROOT=%~dp0"

if not exist "%PS_EXE%" (
  echo PowerShell not found: "%PS_EXE%"
  pause
  exit /b 1
)

if not exist "%ROOT%run-dev.ps1" (
  echo run-dev.ps1 not found: "%ROOT%run-dev.ps1"
  pause
  exit /b 1
)

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%ROOT%run-dev.ps1"

endlocal

