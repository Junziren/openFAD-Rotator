[CmdletBinding()]
param(
    [string]$Compiler = "",
    [string]$BuildDir = "",
    [string]$OutputDirectory = ""
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (!$BuildDir) { $BuildDir = Join-Path $root "build-vs" }
$BuildDir = (Resolve-Path $BuildDir).Path
if (!$Compiler) { $Compiler = Join-Path $BuildDir "installer-tools/InnoSetup/ISCC.exe" }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $BuildDir "garden-release" }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$deps = Join-Path $BuildDir "installer-deps"
foreach ($name in @("MicrosoftEdgeWebView2RuntimeInstallerX64.exe", "VC_redist.current.x64.exe")) {
    $file = Join-Path $deps $name
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "O=Microsoft Corporation") {
        throw "Invalid Microsoft dependency signature: $file"
    }
}
$vc = [version](Get-Item (Join-Path $deps "VC_redist.current.x64.exe")).VersionInfo.ProductVersion
if ($vc -lt [version]"14.51.36247.0") { throw "VC++ installer is older than the setup minimum." }
$stage = Join-Path $OutputDirectory "payload"
& (Join-Path $PSScriptRoot "package-windows-release.ps1") -BuildDir $BuildDir -OutputDirectory $stage
if (!$?) { throw "Payload staging failed" }
& $Compiler "/DPayload=$stage/openFAD Rotator" "/DDependencies=$deps" "/DOutput=$OutputDirectory" (Join-Path $PSScriptRoot "windows-setup.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed: $LASTEXITCODE" }
$exe = Join-Path $OutputDirectory "openFAD-Rotator-0.1.0-Windows-x64-Offline-Setup.exe"
$hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$exe.sha256" -Value "$hash  $(Split-Path $exe -Leaf)" -Encoding ASCII
Write-Host "Offline Setup: $exe"
Write-Host "SHA-256: $hash"
