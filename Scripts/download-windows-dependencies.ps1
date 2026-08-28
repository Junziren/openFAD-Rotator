[CmdletBinding()]
param(
    [string] $OutputDirectory = "",
    [switch] $Force
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $root "build-vs\installer-deps"
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$dependencies = @(
    [ordered]@{
        id = "webview2-evergreen-standalone-x64"
        fileName = "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
        url = "https://go.microsoft.com/fwlink/?linkid=2124701"
        minimumBytes = 200MB
    },
    [ordered]@{
        id = "vc-redist-x64"
        fileName = "VC_redist.x64.exe"
        url = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
        minimumBytes = 20MB
    }
)

function Download-Dependency([hashtable] $Dependency, [string] $Destination) {
    $temporary = "$Destination.part"
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($null -ne $curl) {
        & $curl.Source -L --fail --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 --continue-at - --output $temporary $Dependency.url
        if ($LASTEXITCODE -ne 0) {
            throw "curl failed with exit code $LASTEXITCODE for $($Dependency.id); partial data was kept at $temporary"
        }
    } else {
        Invoke-WebRequest -Uri $Dependency.url -OutFile $temporary -UseBasicParsing
    }

    $item = Get-Item -LiteralPath $temporary
    if ($item.Length -lt [int64]$Dependency.minimumBytes) {
        throw "Downloaded $($Dependency.id) is unexpectedly small: $($item.Length) bytes"
    }
    Move-Item -LiteralPath $temporary -Destination $Destination -Force
}

$manifestEntries = @()
foreach ($dependency in $dependencies) {
    $destination = Join-Path $OutputDirectory $dependency.fileName
    if ($Force -or -not (Test-Path -LiteralPath $destination -PathType Leaf) -or
        (Get-Item -LiteralPath $destination).Length -lt [int64]$dependency.minimumBytes) {
        Write-Host "Downloading $($dependency.id)..."
        Download-Dependency $dependency $destination
    } else {
        Write-Host "Using existing $($dependency.id): $destination"
    }

    $item = Get-Item -LiteralPath $destination
    $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifestEntries += [ordered]@{
        id = $dependency.id
        fileName = $dependency.fileName
        url = $dependency.url
        bytes = [int64]$item.Length
        sha256 = $hash
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    product = "openFAD Rotator"
    publisher = "Unpure Bloom"
    platform = "windows-x64"
    dependencies = $manifestEntries
}
$manifestPath = Join-Path $OutputDirectory "manifest.json"
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6))
Write-Host "Windows installer dependencies: $OutputDirectory"
Write-Host "Dependency manifest: $manifestPath"
