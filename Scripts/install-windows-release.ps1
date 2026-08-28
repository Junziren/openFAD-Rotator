[CmdletBinding()]
param(
    [string] $Package = "",
    [string] $PackageRoot = "",
    [string] $BuildDir = "",
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [string] $InstallRoot = "",
    [switch] $Uninstall
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

function Remove-ProductPath([string] $Path, [string] $Parent, [string] $Label) {
    Assert-ContainedPath $Path $Parent $Label
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
        Write-Host "Removed ${Label}: $Path"
    }
}

function Test-IsAdministrator {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-WebView2Runtime {
    $clientId = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    $registryLocations = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$clientId",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$clientId",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$clientId"
    )

    foreach ($location in $registryLocations) {
        try {
            $properties = Get-ItemProperty -LiteralPath $location -ErrorAction Stop
            $version = [string] $properties.pv
            if ([string]::IsNullOrWhiteSpace($version)) {
                $version = [string] $properties.version
            }
            if (-not [string]::IsNullOrWhiteSpace($version)) {
                return [pscustomobject]@{
                    Version = $version
                    Source = $location
                }
            }
        } catch {
            # Registry discovery is best-effort; continue with installed-file paths.
        }
    }

    $applicationRoots = @()
    foreach ($basePath in @(
        [Environment]::GetEnvironmentVariable("ProgramFiles(x86)"),
        $env:ProgramFiles,
        $env:LOCALAPPDATA
    )) {
        if (-not [string]::IsNullOrWhiteSpace($basePath)) {
            $applicationRoots += Join-Path $basePath "Microsoft\EdgeWebView\Application"
        }
    }

    foreach ($rootPath in $applicationRoots) {
        if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
            continue
        }

        $versionDirectory = Get-ChildItem -LiteralPath $rootPath -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' -and
                           (Test-Path -LiteralPath (Join-Path $_.FullName "msedgewebview2.exe") -PathType Leaf) } |
            Sort-Object Name -Descending |
            Select-Object -First 1
        if ($versionDirectory) {
            return [pscustomobject]@{
                Version = $versionDirectory.Name
                Source = $versionDirectory.FullName
            }
        }
    }

    return $null
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    if (-not (Test-IsAdministrator)) {
        throw "Installing to the system locations requires an elevated PowerShell; pass -InstallRoot for a user-owned smoke install."
    }
    $vst3Root = Join-Path ${env:CommonProgramFiles} "VST3"
    $standaloneRoot = Join-Path ${env:ProgramFiles} "Unpure Bloom\openFAD Rotator"
} else {
    $installBase = Get-FullPath $InstallRoot
    $vst3Root = Join-Path $installBase "VST3"
    $standaloneRoot = Join-Path $installBase "Standalone"
}

$vst3Target = Join-Path $vst3Root "openFAD Rotator.vst3"
$standaloneTarget = $standaloneRoot
Assert-ContainedPath $vst3Target $vst3Root "VST3 target"
if (-not [string]::IsNullOrWhiteSpace($InstallRoot)) {
    Assert-ContainedPath $vst3Root $installBase "VST3 root"
    Assert-ContainedPath $standaloneTarget $installBase "Standalone target"
}

if ($Uninstall) {
    Remove-ProductPath $vst3Target $vst3Root "VST3 plugin"
    if (-not [string]::IsNullOrWhiteSpace($InstallRoot)) {
        Remove-ProductPath $standaloneTarget $installBase "Standalone directory"
    } else {
        $standaloneParent = Split-Path -Parent $standaloneTarget
        Remove-ProductPath $standaloneTarget $standaloneParent "Standalone directory"
    }
    Write-Host "openFAD Rotator uninstall complete."
    return
}

if (-not [string]::IsNullOrWhiteSpace($Package) -and -not [string]::IsNullOrWhiteSpace($PackageRoot)) {
    throw "Use either -Package or -PackageRoot, not both."
}
if ([string]::IsNullOrWhiteSpace($Package) -and [string]::IsNullOrWhiteSpace($PackageRoot) -and [string]::IsNullOrWhiteSpace($BuildDir)) {
    throw "Provide -Package <release.zip>, -PackageRoot <directory>, or -BuildDir <build directory>."
}

$temporaryRoot = $null
try {
    if (-not [string]::IsNullOrWhiteSpace($Package)) {
        $packagePath = Get-FullPath $Package
        if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
            throw "Release package not found: $packagePath"
        }

        $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("openfad-install-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
        Expand-Archive -LiteralPath $packagePath -DestinationPath $temporaryRoot -Force
        $packageRoots = @(Get-ChildItem -LiteralPath $temporaryRoot -Directory)
        $hasNamedRoot = $packageRoots.Count -eq 1 -and (Test-Path -LiteralPath (Join-Path $packageRoots[0].FullName "VST3"))
        if ($hasNamedRoot) {
            # Accept archives that preserve the staging directory name.
            $sourceRoot = $packageRoots[0].FullName
        } elseif (Test-Path -LiteralPath (Join-Path $temporaryRoot "VST3")) {
            # Compress-Archive emits the staging contents at the archive root.
            $sourceRoot = $temporaryRoot
        } else {
            throw "Package does not contain a recognizable openFAD Rotator root."
        }
        $metadataPath = Join-Path $sourceRoot "package-metadata.json"
    } elseif (-not [string]::IsNullOrWhiteSpace($PackageRoot)) {
        $sourceRoot = Get-FullPath $PackageRoot
        if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
            throw "Package root not found: $sourceRoot"
        }
        $metadataPath = Join-Path $sourceRoot "package-metadata.json"
    } else {
        $buildPath = (Resolve-Path $BuildDir).Path
        $artefacts = Join-Path $buildPath "openFADRotator_artefacts\$Configuration"
        $sourceRoot = $null
        $vst3Source = Join-Path $artefacts "VST3\openFAD Rotator.vst3"
        $standaloneSource = Join-Path $artefacts "Standalone"
        $metadataPath = $null
    }

    if ($sourceRoot) {
        $vst3Source = Join-Path $sourceRoot "VST3\openFAD Rotator.vst3"
        $standaloneSource = Join-Path $sourceRoot "Standalone"
    }

    $standaloneExe = Join-Path $standaloneSource "openFAD Rotator.exe"
    $standaloneLoader = Join-Path $standaloneSource "WebView2Loader.dll"
    $vst3Binary = Join-Path $vst3Source "Contents\x86_64-win\openFAD Rotator.vst3"
    $vst3Loader = Join-Path $vst3Source "Contents\x86_64-win\WebView2Loader.dll"
    foreach ($required in @($vst3Source, $vst3Binary, $vst3Loader, $standaloneExe, $standaloneLoader)) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Package is missing required artifact: $required"
        }
    }

    if ($metadataPath -and (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
        $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
        if ($metadata.product -ne "openFAD Rotator" -or $metadata.schemaVersion -ne 1) {
            throw "Unsupported package metadata."
        }
        $hashTargets = @{
            VST3Binary = $vst3Binary
            VST3Loader = $vst3Loader
            Standalone = $standaloneExe
            WebView2Loader = $standaloneLoader
        }
        $expectedHashNames = @("VST3Binary", "VST3Loader", "Standalone", "WebView2Loader")
        foreach ($expectedName in $expectedHashNames) {
            if ($metadata.sha256.PSObject.Properties[$expectedName] -eq $null) {
                throw "Package metadata is missing a hash entry: $expectedName"
            }
        }
        foreach ($entry in $metadata.sha256.PSObject.Properties) {
            if (-not $hashTargets.ContainsKey($entry.Name)) {
                throw "Package metadata contains an unknown hash entry: $($entry.Name)"
            }
            $actualHash = (Get-FileHash -LiteralPath $hashTargets[$entry.Name] -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne ([string]$entry.Value).ToLowerInvariant()) {
                throw "SHA-256 mismatch for $($entry.Name): expected $($entry.Value), got $actualHash"
            }
        }
        Write-Host "Package SHA-256 verification passed."
    } elseif ($Package -or $PackageRoot) {
        throw "Package metadata is missing: $metadataPath"
    }

    if ($Package -or $PackageRoot) {
        $licenseRoot = Join-Path $sourceRoot "THIRD_PARTY_LICENSES"
        $licenseManifestPath = Join-Path $licenseRoot "manifest.json"
        if (-not (Test-Path -LiteralPath $licenseManifestPath -PathType Leaf)) {
            throw "Third-party license manifest is missing: $licenseManifestPath"
        }
        $licenseManifest = Get-Content -LiteralPath $licenseManifestPath -Raw | ConvertFrom-Json
        $licenseManifestComplete = $licenseManifest.product -eq "openFAD Rotator" -and $licenseManifest.schemaVersion -eq 1 -and @($licenseManifest.entries).Count -ge 10
        if (-not $licenseManifestComplete) {
            throw "Third-party license manifest is incomplete."
        }
        foreach ($entry in @($licenseManifest.entries)) {
            $licenseFile = Join-Path $licenseRoot $entry.licenseFile
            Assert-ContainedPath $licenseFile $licenseRoot "third-party license file"
            if (-not (Test-Path -LiteralPath $licenseFile -PathType Leaf)) {
                throw "Third-party license file is missing: $licenseFile"
            }
            $actualHash = (Get-FileHash -LiteralPath $licenseFile -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
                throw "Third-party license hash mismatch: $licenseFile"
            }
        }
        Write-Host "Third-party license manifest verification passed."
    }

    $webView2Runtime = Find-WebView2Runtime
    if ($null -eq $webView2Runtime) {
        throw "Microsoft Edge WebView2 Runtime was not found. Install the Evergreen Runtime before installing openFAD Rotator; the bundled WebView2Loader.dll is not the runtime."
    }
    Write-Host "WebView2 Runtime: $($webView2Runtime.Version) ($($webView2Runtime.Source))"

    Remove-ProductPath $vst3Target $vst3Root "existing VST3 plugin"
    if (-not [string]::IsNullOrWhiteSpace($InstallRoot)) {
        Remove-ProductPath $standaloneTarget $installBase "existing Standalone directory"
    } else {
        $standaloneParent = Split-Path -Parent $standaloneTarget
        Remove-ProductPath $standaloneTarget $standaloneParent "existing Standalone directory"
    }

    New-Item -ItemType Directory -Force -Path $vst3Root, (Split-Path -Parent $standaloneTarget) | Out-Null
    Copy-Item -LiteralPath $vst3Source -Destination $vst3Target -Recurse -Force
    Copy-Item -LiteralPath $standaloneSource -Destination $standaloneTarget -Recurse -Force

    foreach ($installed in @(
        $vst3Binary,
        $vst3Loader,
        (Join-Path $standaloneTarget "openFAD Rotator.exe"),
        (Join-Path $standaloneTarget "WebView2Loader.dll")
    )) {
        if ($installed -eq $vst3Binary) { $installed = Join-Path $vst3Target "Contents\x86_64-win\openFAD Rotator.vst3" }
        if ($installed -eq $vst3Loader) { $installed = Join-Path $vst3Target "Contents\x86_64-win\WebView2Loader.dll" }
        if (-not (Test-Path -LiteralPath $installed -PathType Leaf)) {
            throw "Installed artifact is missing: $installed"
        }
    }

    Write-Host "Installed VST3: $vst3Target"
    Write-Host "Installed Standalone: $standaloneTarget"
    Write-Host "openFAD Rotator installation complete."
} finally {
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
