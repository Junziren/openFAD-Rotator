[CmdletBinding()]
param(
    [switch] $Quiet,
    [switch] $Elevated,
    [switch] $VerifyOnly
)

$ErrorActionPreference = "Stop"

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
            $version = [string]$properties.pv
            if ([string]::IsNullOrWhiteSpace($version)) { $version = [string]$properties.version }
            if (-not [string]::IsNullOrWhiteSpace($version)) {
                return [pscustomobject]@{ Version = $version; Source = $location }
            }
        } catch { }
    }

    foreach ($basePath in @(
        [Environment]::GetEnvironmentVariable("ProgramFiles(x86)"),
        $env:ProgramFiles,
        $env:LOCALAPPDATA
    )) {
        if ([string]::IsNullOrWhiteSpace($basePath)) { continue }
        $rootPath = Join-Path $basePath "Microsoft\EdgeWebView\Application"
        if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) { continue }
        $versionDirectory = Get-ChildItem -LiteralPath $rootPath -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' -and
                           (Test-Path -LiteralPath (Join-Path $_.FullName "msedgewebview2.exe") -PathType Leaf) } |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($versionDirectory) {
            return [pscustomobject]@{ Version = $versionDirectory.Name; Source = $versionDirectory.FullName }
        }
    }
    return $null
}

function Find-VCRuntime {
    $locations = @(
        "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
    )
    foreach ($location in $locations) {
        try {
            $properties = Get-ItemProperty -LiteralPath $location -ErrorAction Stop
            if ([int]$properties.Installed -eq 1) {
                return [string]$properties.Version
            }
        } catch { }
    }
    return $null
}

function Invoke-DependencyInstaller([string]$Path, [string[]]$Arguments, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Bundled dependency is missing: $Path"
    }
    if (-not $Quiet) { Write-Host "Installing $Label..." }
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 1638, 3010)) {
        throw "$Label installer failed with exit code $($process.ExitCode)."
    }
    if ($process.ExitCode -eq 3010 -and -not $Quiet) {
        Write-Warning "$Label requested a reboot; installation continued."
    }
}

function Verify-BundledDependencies([string]$PayloadRoot) {
    $manifestPath = Join-Path $PayloadRoot "Installer\installer-dependencies.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Bundled dependency manifest is missing: $manifestPath"
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.platform -ne "windows-x64") {
        throw "Unsupported bundled dependency manifest."
    }
    foreach ($entry in @($manifest.dependencies)) {
        $dependencyPath = Join-Path $PayloadRoot ("Dependencies\" + [string]$entry.fileName)
        if (-not (Test-Path -LiteralPath $dependencyPath -PathType Leaf)) {
            throw "Bundled dependency is missing: $dependencyPath"
        }
        $item = Get-Item -LiteralPath $dependencyPath
        if ([int64]$entry.bytes -ne [int64]$item.Length) {
            throw "Bundled dependency size mismatch: $($entry.fileName)"
        }
        $actualHash = (Get-FileHash -LiteralPath $dependencyPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Bundled dependency SHA-256 mismatch: $($entry.fileName)"
        }
    }
}

if (-not $VerifyOnly -and -not $Elevated -and -not (Test-IsAdministrator)) {
    $argumentList = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Elevated'
    if ($Quiet) { $argumentList += ' -Quiet' }
    $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argumentList -Wait -PassThru
    exit $process.ExitCode
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("openfad-bundled-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
$ownsPayload = $false

try {
    $payloadArchive = Join-Path $PSScriptRoot "payload.zip"
    if (Test-Path -LiteralPath $payloadArchive -PathType Leaf) {
        Expand-Archive -LiteralPath $payloadArchive -DestinationPath $temporaryRoot -Force
        $payloadRoot = Join-Path $temporaryRoot "payload"
        $ownsPayload = $true
    } elseif (Test-Path -LiteralPath (Join-Path $PSScriptRoot "VST3") -PathType Container) {
        $payloadRoot = $PSScriptRoot
    } else {
        throw "Installer payload is missing: expected payload.zip or a VST3 directory beside this script."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot "VST3") -PathType Container)) {
        throw "Installer payload is malformed: VST3 directory is missing."
    }

    Verify-BundledDependencies $payloadRoot

    if ($VerifyOnly) {
        foreach ($required in @(
            (Join-Path $payloadRoot "VST3\openFAD Rotator.vst3\Contents\x86_64-win\openFAD Rotator.vst3"),
            (Join-Path $payloadRoot "Standalone\openFAD Rotator.exe"),
            (Join-Path $payloadRoot "Standalone\WebView2Loader.dll")
        )) {
            if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
                throw "Offline payload artifact is missing: $required"
            }
        }
        if (-not $Quiet) { Write-Host "Offline payload and dependency hashes verified." }
        return
    }

    $dependenciesRoot = Join-Path $payloadRoot "Dependencies"
    $webView2Installer = Join-Path $dependenciesRoot "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
    $vcInstaller = Join-Path $dependenciesRoot "VC_redist.x64.exe"

    $webView2 = Find-WebView2Runtime
    if ($null -eq $webView2) {
        Invoke-DependencyInstaller $webView2Installer @("/silent", "/install") "Microsoft WebView2 Evergreen Runtime"
    } elseif (-not $Quiet) {
        Write-Host "WebView2 Runtime already present: $($webView2.Version)"
    }

    $vcVersion = Find-VCRuntime
    if ($null -eq $vcVersion) {
        Invoke-DependencyInstaller $vcInstaller @("/install", "/quiet", "/norestart") "Microsoft Visual C++ x64 Runtime"
    } elseif (-not $Quiet) {
        Write-Host "VC++ x64 Runtime already present: $vcVersion"
    }

    if ($null -eq (Find-WebView2Runtime)) {
        throw "WebView2 Runtime installation completed without a detectable runtime."
    }
    if ($null -eq (Find-VCRuntime)) {
        throw "VC++ x64 Runtime installation completed without a detectable runtime."
    }

    $portableInstaller = Join-Path $payloadRoot "Scripts\install-windows-release.ps1"
    if (-not (Test-Path -LiteralPath $portableInstaller -PathType Leaf)) {
        throw "Portable installation script is missing from the payload."
    }
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $portableInstaller -PackageRoot $payloadRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Product installation failed with exit code $LASTEXITCODE."
    }

    $productRoot = Join-Path ${env:ProgramFiles} "Unpure Bloom\openFAD Rotator"
    $uninstallerSource = Join-Path $payloadRoot "Installer\uninstall-bundled-windows.ps1"
    $installerInfoPath = Join-Path $payloadRoot "Installer\installer-info.json"
    if (-not (Test-Path -LiteralPath $uninstallerSource -PathType Leaf)) {
        throw "Uninstaller is missing from the payload."
    }
    New-Item -ItemType Directory -Force -Path $productRoot | Out-Null
    Copy-Item -LiteralPath $uninstallerSource -Destination (Join-Path $productRoot "uninstall.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $payloadRoot "Installer\installer-dependencies.json") -Destination (Join-Path $productRoot "installer-dependencies.json") -Force
    if (Test-Path -LiteralPath $installerInfoPath -PathType Leaf) {
        Copy-Item -LiteralPath $installerInfoPath -Destination (Join-Path $productRoot "installer-info.json") -Force
    }

    $presetRoot = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "openFAD\Rotator\Presets"
    New-Item -ItemType Directory -Force -Path $presetRoot | Out-Null
    $factoryPreset = Join-Path $payloadRoot "Presets\factory.json"
    if (Test-Path -LiteralPath $factoryPreset -PathType Leaf) {
        $installedFactoryPreset = Join-Path $presetRoot "factory.json"
        if (-not (Test-Path -LiteralPath $installedFactoryPreset -PathType Leaf)) {
            Copy-Item -LiteralPath $factoryPreset -Destination $installedFactoryPreset -Force
        }
    }

    $uninstallKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\openFADRotator"
    $displayVersion = "0.1.0"
    if (Test-Path -LiteralPath $installerInfoPath -PathType Leaf) {
        $displayVersionCandidate = (Get-Content -LiteralPath $installerInfoPath -Raw | ConvertFrom-Json).version
        if (-not [string]::IsNullOrWhiteSpace([string]$displayVersionCandidate)) {
            $displayVersion = [string]$displayVersionCandidate
        }
    }
    New-Item -Path $uninstallKey -Force | Out-Null
    New-ItemProperty -LiteralPath $uninstallKey -Name "DisplayName" -Value "openFAD Rotator" -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $uninstallKey -Name "DisplayVersion" -Value $displayVersion -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $uninstallKey -Name "Publisher" -Value "Unpure Bloom" -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $uninstallKey -Name "InstallLocation" -Value $productRoot -PropertyType String -Force | Out-Null
    $uninstallCommand = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $productRoot "uninstall.ps1") + '"'
    New-ItemProperty -LiteralPath $uninstallKey -Name "UninstallString" -Value $uninstallCommand -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $uninstallKey -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty -LiteralPath $uninstallKey -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null

    if (-not $Quiet) {
        Write-Host "openFAD Rotator installation complete."
        Write-Host "VST3: $(Join-Path ${env:CommonProgramFiles} 'VST3\openFAD Rotator.vst3')"
        Write-Host "Standalone: $productRoot"
    }
} finally {
    if ($ownsPayload -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
