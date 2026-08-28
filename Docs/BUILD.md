# Build notes

## Windows

1. Load the Visual Studio developer command environment for x64.
2. Build the WebUI with Node 22 or newer.
3. Configure CMake with a JUCE checkout and the Visual Studio generator.
4. Build `openFADRotator_All` for VST3 and Standalone output.

The Windows build expects `Resources/WebView2/WebView2Loader.dll`. CMake copies this loader into the Standalone output directory and into the VST3 binary directory. Keep the WebView2 Evergreen Runtime installed on the machine where the plugin is run.

The current machine has WebView2 SDK headers under the current-user NuGet cache. A clean machine must install the Microsoft WebView2 SDK package during development and the WebView2 Evergreen Runtime during deployment.

## Apple

Use an Apple Silicon macOS CI runner with the same JUCE checkout. Build VST3, AUv3 and Standalone targets from the same CMake project. Logic Pro validation, signing and notarization remain separate release gates.

The repository includes `.github/workflows/macos-build.yml`, which pins JUCE
8.0.12, builds the WebUI, configures VST3/AUv3/Standalone plus the portable
tests and headless VST3 host smoke, runs CTest, and uploads unsigned artifacts.
A green workflow run proves
Apple compilation and the listed tests only; it does not prove Logic Pro,
GarageBand, iPhone/iPad, signing, notarization, or device performance.

## WebUI protocol

The page calls the JUCE native function `rotatorCommand` with JSON payloads:

- `{ "type": "uiReady" }`
- `{ "type": "parameter", "id": "...", "phase": "begin|set|end", "value": 0..1 }`
- `{ "type": "program", "index": 0..7 }`

Native emits `state` and `telemetry` events. Native parameter state remains authoritative.

The `state` event also carries `program`, `programName`, `programNames`, and
`programCount`; the native editor uses these fields to keep the program strip
aligned with the host factory bank.

Additional native commands:

- `{ "type": "previousProgram" }` / `{ "type": "nextProgram" }`
- `{ "type": "savePreset" }` / `{ "type": "openPreset" }`

Factory program changes write the complete parameter set. User presets are JSON wrappers around the versioned APVTS XML state and are stored below the user's application-data directory in `openFAD/Rotator/Presets`.

## Windows validation

Run `D:\pluginval\pluginval.exe` against the generated VST3 bundle at strictness level 10. The reproducible command and the latest result location are recorded in `Docs/VALIDATION.md`. This validates the Windows VST3 contract only; it does not prove DAW, AU/AUv3, macOS, installer, or release-signing behavior.

The repeatable Windows validation script also runs DSP-only and full Processor
performance/allocation probes. The Processor probes cover the actual
`AudioProcessor::processBlock()` path, including APVTS reads, PlayHead lookup,
and MIDI events; these machine-local results are evidence, not a cross-machine
real-time guarantee.

The same validation script finishes with a release-package audit. To run that
audit independently against an existing package staging directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\audit-release.ps1 `
  -BuildDir .\build-vs `
  -Configuration Release `
  -PackageRoot .\build-vs\validation\install-smoke-Release-<stamp> `
  -PluginvalResults .\build-vs\validation\pluginval-<stamp>
```

The audit verifies offline WebUI assets, package metadata, artifact and
third-party license hashes, and the pluginval completion marker. It does not
replace code signing, a clean-machine test, or legal review.

For a Release artifact inventory and SHA-256 evidence file:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\write-artifact-manifest.ps1 -Configuration Release
```

The manifest covers every file inside the VST3 bundle plus the Standalone executable and WebView2 loader. It is evidence for comparison, not a code-signing or installer result.

To create the offline Windows release bundle after validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\package-windows-offline-release.ps1 -Configuration Release
```

The generated ZIP includes the VST3, Standalone executable, WebView2 loader,
WebView2 Evergreen Offline x64 installer, VC++ x64 Redistributable, validation
documents, license/notices, artifact manifest, dependency hashes, and archive
SHA-256 metadata. It is a ZIP-based offline installer bundle rather than a
single EXE.

After extracting the versioned directory, run the bundled command files as
administrator:

```powershell
.\Install-openFAD-Rotator.cmd

.\Uninstall-openFAD-Rotator.cmd
```

The installer verifies the bundled dependency manifest before running either
runtime installer. It leaves shared runtimes and `%APPDATA%\openFAD\Rotator`
user presets in place during uninstall.
