param(
    [string] $OutputDirectory = "",
    [string] $JUCEPath = "",
    [string] $BuildDir = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-ExistingPath([string] $Path, [string] $Label) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        throw "$Label was not found: $Path"
    }
    return (Resolve-Path $Path).Path
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $root "build-vs\validation\third-party-licenses"
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

if ([string]::IsNullOrWhiteSpace($JUCEPath)) {
    if ([string]::IsNullOrWhiteSpace($BuildDir)) {
        $BuildDir = Join-Path $root "build-vs"
    }
    $cache = Join-Path $BuildDir "CMakeCache.txt"
    if (Test-Path -LiteralPath $cache -PathType Leaf) {
        $cacheLine = Select-String -LiteralPath $cache -Pattern '^JUCE_PATH:PATH=(.*)$' | Select-Object -First 1
        if ($cacheLine) {
            $JUCEPath = $cacheLine.Matches[0].Groups[1].Value
        }
    }
}
if ([string]::IsNullOrWhiteSpace($JUCEPath)) {
    $JUCEPath = Join-Path $root "..\JUCE"
}
$JUCEPath = Resolve-ExistingPath $JUCEPath "JUCE checkout"

function Find-LicenseFile([string] $PackageRoot, [string[]] $Candidates) {
    foreach ($candidate in $Candidates) {
        $path = Join-Path $PackageRoot $candidate
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            return (Resolve-Path $path).Path
        }
    }
    return $null
}

function Read-PackageMetadata([string] $PackageRoot) {
    $packageJson = Join-Path $PackageRoot "package.json"
    if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
        return [ordered]@{}
    }
    return Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json
}

$licenseCandidates = @("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "NOTICE")
$entries = @(
    @{ Id = "fontsource-jetbrains-mono"; Root = (Join-Path $root "WebUI\node_modules\@fontsource\jetbrains-mono"); Source = "WebUI/node_modules/@fontsource/jetbrains-mono"; Required = $true },
    @{ Id = "fontsource-noto-sans-sc"; Root = (Join-Path $root "WebUI\node_modules\@fontsource\noto-sans-sc"); Source = "WebUI/node_modules/@fontsource/noto-sans-sc"; Required = $true },
    @{ Id = "fontsource-source-sans-3"; Root = (Join-Path $root "WebUI\node_modules\@fontsource\source-sans-3"); Source = "WebUI/node_modules/@fontsource/source-sans-3"; Required = $true },
    @{ Id = "gl-matrix"; Root = (Join-Path $root "WebUI\node_modules\gl-matrix"); Source = "WebUI/node_modules/gl-matrix"; Required = $true },
    @{ Id = "lucide-react"; Root = (Join-Path $root "WebUI\node_modules\lucide-react"); Source = "WebUI/node_modules/lucide-react"; Required = $true },
    @{ Id = "react"; Root = (Join-Path $root "WebUI\node_modules\react"); Source = "WebUI/node_modules/react"; Required = $true },
    @{ Id = "react-dom"; Root = (Join-Path $root "WebUI\node_modules\react-dom"); Source = "WebUI/node_modules/react-dom"; Required = $true },
    @{ Id = "scheduler"; Root = (Join-Path $root "WebUI\node_modules\scheduler"); Source = "WebUI/node_modules/scheduler"; Required = $true },
    @{ Id = "juce"; Root = $JUCEPath; Source = "JUCE checkout"; Required = $true; Candidates = @("LICENSE.md", "LICENSE", "COPYING") },
    @{ Id = "vst3-sdk"; Root = (Join-Path $JUCEPath "modules\juce_audio_processors_headless\format_types\VST3_SDK"); Source = "JUCE/modules/juce_audio_processors_headless/format_types/VST3_SDK"; Required = $true; Candidates = @("LICENSE.txt", "LICENSE.md", "LICENSE", "COPYING") }
)

$manifest = @()
foreach ($entry in $entries) {
    $packageRoot = $entry.Root
    if (-not (Test-Path -LiteralPath $packageRoot -PathType Container)) {
        if ($entry.Required) { throw "Third-party component is missing: $($entry.Id) ($packageRoot)" }
        continue
    }

    $candidates = if ($entry.Candidates) { $entry.Candidates } else { $licenseCandidates }
    $license = Find-LicenseFile $packageRoot $candidates
    if ($null -eq $license) {
        throw "No license file found for $($entry.Id) under $packageRoot"
    }

    $metadata = Read-PackageMetadata $packageRoot
    $version = if ($metadata.version) { [string]$metadata.version } else { "source-checkout" }
    $declaredLicense = if ($metadata.license) { [string]$metadata.license } else { "see license text" }
    $destination = Join-Path $OutputDirectory $entry.Id
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -LiteralPath $license -Destination (Join-Path $destination "LICENSE") -Force
    if (Test-Path -LiteralPath (Join-Path $packageRoot "package.json") -PathType Leaf) {
        Copy-Item -LiteralPath (Join-Path $packageRoot "package.json") -Destination (Join-Path $destination "package.json") -Force
    }

    $manifest += [ordered]@{
        id = $entry.Id
        version = $version
        declaredLicense = $declaredLicense
        source = $entry.Source
        licenseFile = (Join-Path $entry.Id "LICENSE").Replace('\', '/')
        sha256 = (Get-FileHash -LiteralPath (Join-Path $destination "LICENSE") -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$manifestPath = Join-Path $OutputDirectory "manifest.json"
[System.IO.File]::WriteAllText(
    $manifestPath,
    ([ordered]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString("o")
        product = "openFAD Rotator"
        publisher = "Unpure Bloom"
        entries = $manifest
    } | ConvertTo-Json -Depth 6)
)
Write-Host "Third-party license bundle: $OutputDirectory"
Write-Host "Third-party license entries: $($manifest.Count)"
