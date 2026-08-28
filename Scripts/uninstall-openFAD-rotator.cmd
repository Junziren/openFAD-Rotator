@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-openFAD-Rotator.ps1" %*
exit /b %ERRORLEVEL%
