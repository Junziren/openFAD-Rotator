[CmdletBinding()]
param(
    [string] $BuildDir = "",
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [string] $OutputDirectory = "",
    [string] $DependencyDirectory = "",
    [string] $ProductVersion = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-ProjectVersion {
    $cmake = Get-Content -LiteralPath (Join-Path $root "CMakeLists.txt") -Raw
    $match = [regex]::Match($cmake, 'project\s*\(\s*openFADRotator\s+VERSION\s+([0-9]+(?:\.[0-9]+){1,3})', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) { throw "Could not determine the project version from CMakeLists.txt." }
    return $match.Groups[1].Value
}

if ([string]::IsNullOrWhiteSpace($BuildDir)) { $BuildDir = Join-Path $root "build-vs" }
$BuildDir = (Resolve-Path $BuildDir).Path
if ([string]::IsNullOrWhiteSpace($ProductVersion)) { $ProductVersion = Get-ProjectVersion }
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Join-Path $BuildDir "offline-release" }
if ([string]::IsNullOrWhiteSpace($DependencyDirectory)) { $DependencyDirectory = Join-Path $BuildDir "installer-deps" }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$DependencyDirectory = [System.IO.Path]::GetFullPath($DependencyDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$webView2Installer = Join-Path $DependencyDirectory "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
$vcInstaller = Join-Path $DependencyDirectory "VC_redist.x64.exe"
$dependencyManifest = Join-Path $DependencyDirectory "manifest.json"
if (-not (Test-Path -LiteralPath $webView2Installer -PathType Leaf) -or
    -not (Test-Path -LiteralPath $vcInstaller -PathType Leaf) -or
    -not (Test-Path -LiteralPath $dependencyManifest -PathType Leaf)) {
    & (Join-Path $root "Scripts\download-windows-dependencies.ps1") -OutputDirectory $DependencyDirectory
    if (-not $?) { throw "Windows dependency download failed." }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$work = Join-Path $BuildDir "offline-release-work\$stamp"
$portableOutput = Join-Path $work "portable"
$stage = Join-Path $work "openFAD-Rotator-$ProductVersion-Windows-x64"
New-Item -ItemType Directory -Force -Path $work, $stage | Out-Null

& (Join-Path $root "Scripts\package-windows-release.ps1") `
    -BuildDir $BuildDir `
    -Configuration $Configuration `
    -OutputDirectory $portableOutput
if (-not $?) { throw "Portable package preparation failed." }

$portableRoot = Join-Path $portableOutput "openFAD Rotator"
if (-not (Test-Path -LiteralPath $portableRoot -PathType Container)) {
    throw "Portable package staging root was not created: $portableRoot"
}
Copy-Item -Path (Join-Path $portableRoot "*") -Destination $stage -Recurse -Force

$dependenciesRoot = Join-Path $stage "Dependencies"
$installerRoot = Join-Path $stage "Installer"
New-Item -ItemType Directory -Force -Path $dependenciesRoot, $installerRoot | Out-Null
Copy-Item -LiteralPath $webView2Installer -Destination (Join-Path $dependenciesRoot (Split-Path -Leaf $webView2Installer)) -Force
Copy-Item -LiteralPath $vcInstaller -Destination (Join-Path $dependenciesRoot (Split-Path -Leaf $vcInstaller)) -Force
Copy-Item -LiteralPath $dependencyManifest -Destination (Join-Path $installerRoot "installer-dependencies.json") -Force
Copy-Item -LiteralPath (Join-Path $root "Scripts\uninstall-bundled-windows.ps1") -Destination (Join-Path $installerRoot "uninstall-bundled-windows.ps1") -Force
Copy-Item -LiteralPath (Join-Path $root "Scripts\install-bundled-windows.ps1") -Destination (Join-Path $stage "Install-openFAD-Rotator.ps1") -Force
Copy-Item -LiteralPath (Join-Path $root "Scripts\uninstall-bundled-windows.ps1") -Destination (Join-Path $stage "Uninstall-openFAD-Rotator.ps1") -Force
Copy-Item -LiteralPath (Join-Path $root "Scripts\install-openFAD-rotator.cmd") -Destination (Join-Path $stage "Install-openFAD-Rotator.cmd") -Force
Copy-Item -LiteralPath (Join-Path $root "Scripts\uninstall-openFAD-rotator.cmd") -Destination (Join-Path $stage "Uninstall-openFAD-Rotator.cmd") -Force

$installerInfo = [ordered]@{
    schemaVersion = 1
    product = "openFAD Rotator"
    publisher = "Unpure Bloom"
    version = $ProductVersion
    platform = "windows-x64"
    installRoot = "%ProgramFiles%\\Unpure Bloom\\openFAD Rotator"
    vst3Root = "%CommonProgramFiles%\\VST3\\openFAD Rotator.vst3"
    sharedRuntimes = @("WebView2 Evergreen Runtime", "Microsoft Visual C++ x64 Runtime")
    packageType = "offline-zip-installer"
}
[System.IO.File]::WriteAllText(
    (Join-Path $installerRoot "installer-info.json"),
    ($installerInfo | ConvertTo-Json -Depth 6)
)

$zipName = "openFAD-Rotator-$ProductVersion-Windows-x64-Offline.zip"
$zipPath = Join-Path $OutputDirectory $zipName
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -LiteralPath $stage -DestinationPath $zipPath -CompressionLevel Optimal

$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$hashPath = "$zipPath.sha256"
Set-Content -LiteralPath $hashPath -Value "$zipHash  $zipName" -Encoding ASCII
$manifestPath = Join-Path $OutputDirectory "openFAD-Rotator-$ProductVersion-Windows-x64-Offline.manifest.json"
$manifest = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    product = "openFAD Rotator"
    publisher = "Unpure Bloom"
    version = $ProductVersion
    platform = "windows-x64"
    packageType = "offline-zip-installer"
    archive = $zipName
    bytes = [int64](Get-Item -LiteralPath $zipPath).Length
    sha256 = $zipHash
    bundledDependencies = Get-Content -LiteralPath $dependencyManifest -Raw | ConvertFrom-Json
}
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8))

Write-Host "Offline Windows release: $zipPath"
Write-Host "Archive SHA-256: $zipHash"
Write-Host "Archive manifest: $manifestPath"
