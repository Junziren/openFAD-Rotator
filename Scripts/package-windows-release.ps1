param(
    [string] $BuildDir = "",
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [string] $OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $root "build-vs"
}
$BuildDir = (Resolve-Path $BuildDir).Path

$artefacts = Join-Path $BuildDir "openFADRotator_artefacts\$Configuration"
$vst3 = Join-Path $artefacts "VST3\openFAD Rotator.vst3"
$standaloneDir = Join-Path $artefacts "Standalone"
$standalone = Join-Path $standaloneDir "openFAD Rotator.exe"
$loader = Join-Path $standaloneDir "WebView2Loader.dll"
$vst3Binary = Join-Path $vst3 "Contents\x86_64-win\openFAD Rotator.vst3"
$vst3Loader = Join-Path $vst3 "Contents\x86_64-win\WebView2Loader.dll"

foreach ($required in @($vst3, $standalone, $loader, $vst3Binary, $vst3Loader)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Missing release artifact: $required"
    }
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputDirectory = Join-Path $BuildDir "release-package\openFAD-Rotator-$Configuration-$stamp"
}

$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$stage = Join-Path $OutputDirectory "openFAD Rotator"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$stageVst3 = Join-Path $stage "VST3\openFAD Rotator.vst3"
$stageVst3Binary = Join-Path $stageVst3 "Contents\x86_64-win\openFAD Rotator.vst3"
$stageVst3Loader = Join-Path $stageVst3 "Contents\x86_64-win\WebView2Loader.dll"
$stageStandalone = Join-Path $stage "Standalone"
$stageDocs = Join-Path $stage "Docs"
$stageScripts = Join-Path $stage "Scripts"
$stageLicenses = Join-Path $stage "THIRD_PARTY_LICENSES"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stageVst3), $stageStandalone, $stageDocs, $stageScripts, $stageLicenses | Out-Null

Copy-Item -LiteralPath $vst3 -Destination $stageVst3 -Recurse -Force
Copy-Item -LiteralPath $standalone -Destination (Join-Path $stageStandalone "openFAD Rotator.exe") -Force
Copy-Item -LiteralPath $loader -Destination (Join-Path $stageStandalone "WebView2Loader.dll") -Force

foreach ($file in @("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md")) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file) -Force
}
foreach ($file in @("BUILD.md", "VALIDATION.md", "IMPLEMENTATION_STATUS.md")) {
    Copy-Item -LiteralPath (Join-Path $root "Docs\$file") -Destination (Join-Path $stageDocs $file) -Force
}
Copy-Item -LiteralPath (Join-Path $root "Scripts\install-windows-release.ps1") -Destination (Join-Path $stageScripts "install-windows-release.ps1") -Force
& (Join-Path $root "Scripts\collect-third-party-licenses.ps1") `
    -OutputDirectory $stageLicenses `
    -BuildDir $BuildDir
if (-not $?) { throw "Third-party license collection failed" }
if (-not (Test-Path -LiteralPath (Join-Path $stageLicenses "manifest.json") -PathType Leaf)) {
    throw "Third-party license manifest was not generated: $stageLicenses"
}

$manifest = Join-Path $stage "release-artifact-manifest.json"
& (Join-Path $root "Scripts\write-artifact-manifest.ps1") `
    -BuildDir $BuildDir `
    -Configuration $Configuration `
    -Output $manifest
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw "Artifact manifest generation failed: $manifest was not created"
}

$hashes = [ordered]@{}
foreach ($entry in @(
    @{ Name = "VST3Binary"; Path = $stageVst3Binary },
    @{ Name = "VST3Loader"; Path = $stageVst3Loader },
    @{ Name = "Standalone"; Path = (Join-Path $stageStandalone "openFAD Rotator.exe") },
    @{ Name = "WebView2Loader"; Path = (Join-Path $stageStandalone "WebView2Loader.dll") }
)) {
    $hashes[$entry.Name] = (Get-FileHash -LiteralPath $entry.Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$metadata = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    product = "openFAD Rotator"
    publisher = "Unpure Bloom"
    configuration = $Configuration
    requiresWebView2EvergreenRuntime = $true
    includes = @("VST3", "Standalone", "WebView2Loader", "Docs", "Scripts", "THIRD_PARTY_LICENSES", "LICENSE", "THIRD_PARTY_NOTICES.md")
    sha256 = $hashes
}
$metadataPath = Join-Path $stage "package-metadata.json"
[System.IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json -Depth 6))

$zip = "$OutputDirectory.zip"
if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal

$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Release package: $zip"
Write-Host "Package SHA-256: $zipHash"
Write-Host "Staging directory: $OutputDirectory"
