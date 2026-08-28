param(
    [string] $BuildDir = "",
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [string] $Output = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $root "build-vs"
}
$BuildDir = (Resolve-Path $BuildDir).Path

$artefacts = Join-Path $BuildDir "openFADRotator_artefacts\$Configuration"
$vst3 = Join-Path $artefacts "VST3\openFAD Rotator.vst3"
$standalone = Join-Path $artefacts "Standalone"
$required = @(
    $vst3,
    (Join-Path $standalone "openFAD Rotator.exe"),
    (Join-Path $standalone "WebView2Loader.dll")
)

foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing release artifact: $path"
    }
}

if ([string]::IsNullOrWhiteSpace($Output)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Output = Join-Path $BuildDir "validation\artifact-manifest-$Configuration-$stamp.json"
}

$files = @()
$roots = @(
    @{ Name = "VST3"; Path = $vst3 },
    @{ Name = "Standalone"; Path = (Join-Path $standalone "openFAD Rotator.exe") },
    @{ Name = "Standalone"; Path = (Join-Path $standalone "WebView2Loader.dll") }
)

foreach ($entry in $roots) {
    $path = $entry.Path
    $items = if (Test-Path -LiteralPath $path -PathType Container) {
        Get-ChildItem -LiteralPath $path -File -Recurse
    } else {
        @(Get-Item -LiteralPath $path)
    }

    foreach ($item in $items) {
        $relative = $item.FullName.Substring($root.Length).TrimStart('\', '/')
        $relative = $relative.Replace('\', '/')
        $hash = Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256
        $files += ,([ordered]@{
            artifact = $entry.Name
            path = $relative
            bytes = $item.Length
            sha256 = $hash.Hash.ToLowerInvariant()
        })
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    configuration = $Configuration
    product = "openFAD Rotator"
    publisher = "Unpure Bloom"
    files = $files
}

$parent = Split-Path -Parent $Output
New-Item -ItemType Directory -Force -Path $parent | Out-Null
[System.IO.File]::WriteAllText(
    (Resolve-Path $parent).Path + "\" + (Split-Path -Leaf $Output),
    ($manifest | ConvertTo-Json -Depth 5)
)
Write-Host "Artifact manifest: $Output"
