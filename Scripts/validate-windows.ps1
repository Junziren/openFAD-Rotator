param(
    [string] $BuildDir = "",
    [string] $PluginvalPath = "D:\pluginval\pluginval.exe",
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [switch] $SkipPluginval
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BuildDir)) {
    $BuildDir = Join-Path $root "build-vs"
}
$BuildDir = (Resolve-Path $BuildDir).Path

Write-Host "[1/9] Validate speaker manifest"
Push-Location (Join-Path $root "WebUI")
try {
    & npm run validate:manifest
    if ($LASTEXITCODE -ne 0) { throw "Speaker manifest validation failed" }
    Write-Host "[2/9] Build WebUI"
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "WebUI build failed" }
}
finally {
    Pop-Location
}

Write-Host "[3/9] Build native targets"
$standaloneExe = Join-Path $BuildDir "openFADRotator_artefacts\$Configuration\Standalone\openFAD Rotator.exe"
$dspTestExe = Join-Path $BuildDir "openFADRotator_DSPTests_artefacts\$Configuration\openFADRotator_DSPTests.exe"
$dspSoakTestExe = Join-Path $BuildDir "openFADRotator_DSPSoakTests_artefacts\$Configuration\openFADRotator_DSPSoakTests.exe"
$processorTestExe = Join-Path $BuildDir "openFADRotator_ProcessorTests_artefacts\$Configuration\openFADRotator_ProcessorTests.exe"
$runningStandalone = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $standaloneExe }
if ($runningStandalone) {
    throw "Close the running Standalone before building: $standaloneExe"
}
& cmake --build $BuildDir --config $Configuration --target openFADRotator_All
if ($LASTEXITCODE -ne 0) { throw "Native build failed" }

$standaloneDir = Join-Path $BuildDir "openFADRotator_artefacts\$Configuration\Standalone"
$vst3Dir = Join-Path $BuildDir "openFADRotator_artefacts\$Configuration\VST3"
$vst3 = Join-Path $vst3Dir "openFAD Rotator.vst3"
$vst3LoaderCandidates = @(
    (Join-Path $vst3Dir "WebView2Loader.dll"),
    (Join-Path $vst3 "Contents\x86_64-win\WebView2Loader.dll")
)
foreach ($requiredPath in @(
    (Join-Path $standaloneDir "openFAD Rotator.exe"),
    (Join-Path $standaloneDir "WebView2Loader.dll"),
    $vst3
)) {
    if (-not ((Test-Path -LiteralPath $requiredPath -PathType Leaf) -or (Test-Path -LiteralPath $requiredPath -PathType Container))) {
        throw "Missing build artifact: $requiredPath"
    }
}
if (-not ($vst3LoaderCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })) {
    throw "Missing VST3 WebView2Loader.dll in expected root or bundle locations: $($vst3LoaderCandidates -join '; ')"
}

if (-not $SkipPluginval) {
    Write-Host "[4/9] Run pluginval"
    if (-not (Test-Path -LiteralPath $PluginvalPath -PathType Leaf)) {
        throw "pluginval not found at $PluginvalPath; pass -SkipPluginval or provide -PluginvalPath"
    }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $results = Join-Path $root "build-vs\validation\pluginval-$stamp"
    New-Item -ItemType Directory -Force -Path $results | Out-Null
    & $PluginvalPath --validate $vst3 --strictness-level 10 --timeout-ms 120000 --verbose --output-dir $results
    if ($LASTEXITCODE -ne 0) { throw "pluginval failed with exit code $LASTEXITCODE" }
    $deadline = (Get-Date).AddSeconds(180)
    $log = $null
    $complete = $false
    while ((Get-Date) -lt $deadline -and -not $complete) {
        $log = Get-ChildItem -LiteralPath $results -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($log) {
            $content = Get-Content -LiteralPath $log.FullName -Raw -ErrorAction SilentlyContinue
            $complete = $content -match "Completed tests in pluginval / Fuzz parameters"
        }
        if (-not $complete) { Start-Sleep -Milliseconds 250 }
    }
    if (-not $complete) { throw "pluginval log did not reach its completion marker: $results" }
    if ($content -match "(?im)^.*\b(FAIL|ERROR)\b.*$") { throw "pluginval log contains a failure marker: $log" }
    Write-Host "pluginval results: $results"
}
else {
    Write-Host "[4/9] pluginval skipped"
}

Write-Host "[5/9] Run DSP regression tests"
& cmake --build $BuildDir --config $Configuration --target openFADRotator_DSPTests
if ($LASTEXITCODE -ne 0) { throw "DSP regression test build failed" }
if (-not (Test-Path -LiteralPath $dspTestExe -PathType Leaf)) {
    throw "Missing DSP regression test executable: $dspTestExe"
}
& $dspTestExe
if ($LASTEXITCODE -ne 0) { throw "DSP regression tests failed with exit code $LASTEXITCODE" }

Write-Host "[6/9] Run DSP performance checks"
$dspPerformanceTestExe = Join-Path $BuildDir "openFADRotator_DSPPerformanceTests_artefacts\$Configuration\openFADRotator_DSPPerformanceTests.exe"
& cmake --build $BuildDir --config $Configuration --target openFADRotator_DSPPerformanceTests
if ($LASTEXITCODE -ne 0) { throw "DSP performance test build failed" }
if (-not (Test-Path -LiteralPath $dspPerformanceTestExe -PathType Leaf)) {
    throw "Missing DSP performance test executable: $dspPerformanceTestExe"
}
& $dspPerformanceTestExe
if ($LASTEXITCODE -ne 0) { throw "DSP performance checks failed with exit code $LASTEXITCODE" }

Write-Host "[7/9] Run processor audio-chain checks"
& cmake --build $BuildDir --config $Configuration --target openFADRotator_ProcessorTests
if ($LASTEXITCODE -ne 0) { throw "Processor test build failed" }
if (-not (Test-Path -LiteralPath $processorTestExe -PathType Leaf)) {
    throw "Missing processor test executable: $processorTestExe"
}
& $processorTestExe
if ($LASTEXITCODE -ne 0) { throw "Processor audio-chain checks failed with exit code $LASTEXITCODE" }

Write-Host "[8/9] Run DSP soak checks"
& cmake --build $BuildDir --config $Configuration --target openFADRotator_DSPSoakTests
if ($LASTEXITCODE -ne 0) { throw "DSP soak test build failed with exit code $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $dspSoakTestExe -PathType Leaf)) {
    throw "Missing DSP soak test executable: $dspSoakTestExe"
}
& $dspSoakTestExe
if ($LASTEXITCODE -ne 0) { throw "DSP soak checks failed with exit code $LASTEXITCODE" }

Write-Host "[9/9] Windows validation complete"
Write-Host "VST3: $vst3"
Write-Host "Standalone: $(Join-Path $standaloneDir 'openFAD Rotator.exe')"
Write-Host "DSP tests: $dspTestExe"
Write-Host "DSP performance: $dspPerformanceTestExe"
Write-Host "DSP soak: $dspSoakTestExe"
Write-Host "Processor tests: $processorTestExe"
