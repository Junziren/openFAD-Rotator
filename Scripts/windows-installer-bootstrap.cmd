@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-bundled-windows.ps1" %*
exit /b %ERRORLEVEL%
