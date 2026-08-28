[CmdletBinding()]
param(
    [switch] $Quiet,
    [switch] $Elevated
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $Elevated -and -not (Test-IsAdministrator)) {
    $argumentList = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Elevated'
    if ($Quiet) { $argumentList += ' -Quiet' }
    $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argumentList -Wait -PassThru
    exit $process.ExitCode
}

$vst3Root = Join-Path ${env:CommonProgramFiles} "VST3"
$vst3Target = Join-Path $vst3Root "openFAD Rotator.vst3"
$productRoot = Join-Path ${env:ProgramFiles} "Unpure Bloom\openFAD Rotator"
$uninstallKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\openFADRotator"

if (Test-Path -LiteralPath $vst3Target) {
    Remove-Item -LiteralPath $vst3Target -Recurse -Force
}
if (Test-Path -LiteralPath $productRoot) {
    $cleanupScript = Join-Path ([System.IO.Path]::GetTempPath()) ("openfad-uninstall-" + [guid]::NewGuid().ToString("N") + ".cmd")
    $escapedRoot = $productRoot.Replace('"', '""')
    @"
@echo off
timeout /t 1 /nobreak >nul
rmdir /s /q "$escapedRoot"
del "%~f0"
"@ | Set-Content -LiteralPath $cleanupScript -Encoding ASCII
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$cleanupScript`"" -WindowStyle Hidden
}
if (Test-Path -LiteralPath $uninstallKey) {
    Remove-Item -LiteralPath $uninstallKey -Recurse -Force
}

if (-not $Quiet) {
    Write-Host "openFAD Rotator uninstall requested. Shared WebView2/VC++ runtimes and user presets were kept."
}
