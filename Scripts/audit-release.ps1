[CmdletBinding()]
param(
    [string] $BuildDir = "",
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [string] $PackageRoot = "",
    [string] $Package = "",
    [string] $PluginvalResults = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-FullPath([string] $Path) {
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-ContainedPath([string] $Path, [string] $Parent, [string] $Label) {
    $fullPath = (Get-FullPath $Path).TrimEnd('\', '/')
    $fullParent = (Get-FullPath $Parent).TrimEnd('\', '/')
    if (-not $fullPath.StartsWith($fullParent + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label escapes its intended root: $fullPath"
    }
}

function Require-File([string] $Path, [string] $Label) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing ${Label}: $Path"
    }
}

function Require-Directory([string] $Path, [string] $Label) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "Missing ${Label}: $Path"
    }
}

function Read-Json([string] $Path, [string] $Label) {
    Require-File $Path $Label
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Resolve-PackageRoot([string] $Path) {
    $candidate = Get-FullPath $Path
    Require-Directory $candidate "package root"
    if (Test-Path -LiteralPath (Join-Path $candidate "VST3") -PathType Container) {
        return $candidate
    }

    $children = @(Get-ChildItem -LiteralPath $candidate -Directory)
    if ($children.Count -eq 1 -and (Test-Path -LiteralPath (Join-Path $children[0].FullName "VST3") -PathType Container)) {
        return $children[0].FullName
    }

    throw "Could not find a package root containing VST3 under: $candidate"
}

$temporaryRoot = $null
try {
    if ([string]::IsNullOrWhiteSpace($BuildDir)) {
        $BuildDir = Join-Path $root "build-vs"
    }
    $BuildDir = (Resolve-Path $BuildDir).Path

    if (-not [string]::IsNullOrWhiteSpace($Package)) {
        $packagePath = Get-FullPath $Package
        Require-File $packagePath "release package"
        $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("openfad-audit-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
        Expand-Archive -LiteralPath $packagePath -DestinationPath $temporaryRoot -Force
        $PackageRoot = $temporaryRoot
    }

    $buildArtefacts = Join-Path $BuildDir "openFADRotator_artefacts\$Configuration"
    $sourceVst3 = Join-Path $buildArtefacts "VST3\openFAD Rotator.vst3"
    $sourceStandalone = Join-Path $buildArtefacts "Standalone"
    $sourceVst3Binary = Join-Path $sourceVst3 "Contents\x86_64-win\openFAD Rotator.vst3"
    $sourceVst3Loader = Join-Path $sourceVst3 "Contents\x86_64-win\WebView2Loader.dll"

    Require-Directory $sourceVst3 "built VST3 bundle"
    Require-File $sourceVst3Binary "built VST3 binary"
    Require-File $sourceVst3Loader "built VST3 WebView2 loader"
    Require-File (Join-Path $sourceStandalone "openFAD Rotator.exe") "built Standalone"
    Require-File (Join-Path $sourceStandalone "WebView2Loader.dll") "built Standalone WebView2 loader"

    $package = $null
    if (-not [string]::IsNullOrWhiteSpace($PackageRoot)) {
        $package = Resolve-PackageRoot $PackageRoot
        $packageVst3 = Join-Path $package "VST3\openFAD Rotator.vst3"
        $packageStandalone = Join-Path $package "Standalone"
        Require-Directory $packageVst3 "release package VST3 bundle"
        foreach ($required in @(
            (Join-Path $packageVst3 "Contents\x86_64-win\openFAD Rotator.vst3"),
            (Join-Path $packageVst3 "Contents\x86_64-win\WebView2Loader.dll"),
            (Join-Path $packageStandalone "openFAD Rotator.exe"),
            (Join-Path $packageStandalone "WebView2Loader.dll"),
            (Join-Path $package "README.md"),
            (Join-Path $package "LICENSE"),
            (Join-Path $package "THIRD_PARTY_NOTICES.md"),
            (Join-Path $package "package-metadata.json"),
            (Join-Path $package "release-artifact-manifest.json"),
            (Join-Path $package "THIRD_PARTY_LICENSES\manifest.json")
        )) {
            Require-File $required "release package artifact"
        }

        $metadata = Read-Json (Join-Path $package "package-metadata.json") "package metadata"
        if (($metadata.schemaVersion -ne 1) -or ($metadata.product -ne "openFAD Rotator") -or ($metadata.publisher -ne "Unpure Bloom") -or ($metadata.configuration -ne $Configuration) -or ($metadata.requiresWebView2EvergreenRuntime -ne $true)) {
            throw "Package metadata does not match the expected openFAD Rotator schema."
        }

        $hashTargets = @{
            VST3Binary = Join-Path $packageVst3 "Contents\x86_64-win\openFAD Rotator.vst3"
            VST3Loader = Join-Path $packageVst3 "Contents\x86_64-win\WebView2Loader.dll"
            Standalone = Join-Path $packageStandalone "openFAD Rotator.exe"
            WebView2Loader = Join-Path $packageStandalone "WebView2Loader.dll"
        }
        foreach ($expectedName in @("VST3Binary", "VST3Loader", "Standalone", "WebView2Loader")) {
            if ($metadata.sha256.PSObject.Properties[$expectedName] -eq $null) {
                throw "Package metadata is missing a hash entry: $expectedName"
            }
        }
        foreach ($entry in $metadata.sha256.PSObject.Properties) {
            if (-not $hashTargets.ContainsKey($entry.Name)) {
                throw "Package metadata contains an unknown hash entry: $($entry.Name)"
            }
            $actual = (Get-FileHash -LiteralPath $hashTargets[$entry.Name] -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actual -ne ([string] $entry.Value).ToLowerInvariant()) {
                throw "Package SHA-256 mismatch for $($entry.Name): expected $($entry.Value), got $actual"
            }
        }

        $artifactManifestPath = Join-Path $package "release-artifact-manifest.json"
        $artifactManifest = Read-Json $artifactManifestPath "release artifact manifest"
        if ($artifactManifest.schemaVersion -ne 1 -or $artifactManifest.product -ne "openFAD Rotator") {
            throw "Release artifact manifest has an unsupported schema."
        }
        foreach ($entry in @($artifactManifest.files)) {
            if ([string]::IsNullOrWhiteSpace([string] $entry.path)) {
                throw "Release artifact manifest contains an empty path."
            }
            $sourcePath = Join-Path $root ([string] $entry.path)
            Require-File $sourcePath "manifested build artifact"
            $sourceInfo = Get-Item -LiteralPath $sourcePath
            $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ([int64] $entry.bytes -ne [int64] $sourceInfo.Length -or $sourceHash -ne ([string] $entry.sha256).ToLowerInvariant()) {
                throw "Build artifact manifest mismatch: $($entry.path)"
            }

            if ($package) {
                $relative = ([string] $entry.path).Replace('/', '\')
                if ($relative -match '\\VST3\\(.+)$') {
                    $packageRelative = Join-Path "VST3" $Matches[1]
                } elseif ($relative -match '\\Standalone\\(.+)$') {
                    $packageRelative = Join-Path "Standalone" $Matches[1]
                } else {
                    throw "Could not map artifact manifest path into the package: $($entry.path)"
                }
                $packagePath = Join-Path $package $packageRelative
                Assert-ContainedPath $packagePath $package "package artifact manifest path"
                Require-File $packagePath "packaged manifested artifact"
                $packageInfo = Get-Item -LiteralPath $packagePath
                $packageHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
                if ([int64] $entry.bytes -ne [int64] $packageInfo.Length -or $packageHash -ne ([string] $entry.sha256).ToLowerInvariant()) {
                    throw "Packaged artifact manifest mismatch: $packageRelative"
                }
            }
        }

        $licenseManifest = Read-Json (Join-Path $package "THIRD_PARTY_LICENSES\manifest.json") "third-party license manifest"
        if ($licenseManifest.schemaVersion -ne 1 -or $licenseManifest.product -ne "openFAD Rotator") {
            throw "Third-party license manifest has an unsupported schema."
        }
        $licenseRoot = Join-Path $package "THIRD_PARTY_LICENSES"
        $licenseEntries = @($licenseManifest.entries)
        if ($licenseEntries.Count -lt 10) {
            throw "Third-party license manifest contains too few entries: $($licenseEntries.Count)"
        }
        foreach ($entry in $licenseEntries) {
            $licensePath = Join-Path $licenseRoot ([string] $entry.licenseFile)
            Assert-ContainedPath $licensePath $licenseRoot "third-party license path"
            Require-File $licensePath "third-party license"
            $actualHash = (Get-FileHash -LiteralPath $licensePath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne ([string] $entry.sha256).ToLowerInvariant()) {
                throw "Third-party license hash mismatch: $($entry.id)"
            }
        }
    }

    $webDist = Join-Path $root "WebUI\dist"
    Require-Directory $webDist "production WebUI bundle"
    $webFiles = @(Get-ChildItem -LiteralPath $webDist -Recurse -File |
        Where-Object { $_.Extension -in @(".html", ".js", ".css", ".json", ".map") })
    if ($webFiles.Count -eq 0) {
        throw "Production WebUI bundle contains no inspectable text assets."
    }
    $forbiddenPatterns = @(
        "localhost",
        "127\.0\.0\.1",
        "file://",
        "cdn\\.",
        "three(?:\\.min)?\\.js",
        'https?://(?!juce\.backend\b|react\.dev\b|www\.w3\.org\b|github\.com/Junziren(?:/openFAD-Rotator)?(?:[\x2f\x3f\x23\x22\x27\x60\x2c\s\x29\x7d]|$)|fadrecords\.com/openfad(?:[\x2f\x3f\x23\x22\x27\x60\x2c\s\x29\x7d]|$))'
    )
    foreach ($file in $webFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
        foreach ($pattern in $forbiddenPatterns) {
            if ($content -match $pattern) {
                throw "Offline WebUI audit found '$pattern' in $($file.FullName)"
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($PluginvalResults)) {
        $pluginvalPath = Get-FullPath $PluginvalResults
        if (Test-Path -LiteralPath $pluginvalPath -PathType Container) {
            $logs = @(Get-ChildItem -LiteralPath $pluginvalPath -File -Recurse)
        } elseif (Test-Path -LiteralPath $pluginvalPath -PathType Leaf) {
            $logs = @(Get-Item -LiteralPath $pluginvalPath)
        } else {
            throw "pluginval result path was not found: $pluginvalPath"
        }
        if ($logs.Count -eq 0) {
            throw "pluginval result path contains no logs: $pluginvalPath"
        }
        $completed = $false
        foreach ($log in $logs) {
            $content = Get-Content -LiteralPath $log.FullName -Raw -ErrorAction SilentlyContinue
            if ($content -match "Completed tests in pluginval / Fuzz parameters") {
                $completed = $true
            }
            if ($content -match "(?im)^.*\b(FAIL|ERROR)\b.*$") {
                throw "pluginval log contains a failure marker: $($log.FullName)"
            }
        }
        if (-not $completed) {
            throw "pluginval logs did not contain the completion marker: $pluginvalPath"
        }
    }

    Write-Host "Release audit passed."
    Write-Host "Built VST3: $sourceVst3"
    if ($package) { Write-Host "Audited package root: $package" }
    if ($PluginvalResults) { Write-Host "Audited pluginval results: $PluginvalResults" }
}
finally {
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
