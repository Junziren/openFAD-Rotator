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

## WebUI protocol

The page calls the JUCE native function `rotatorCommand` with JSON payloads:

- `{ "type": "uiReady" }`
- `{ "type": "parameter", "id": "...", "phase": "begin|set|end", "value": 0..1 }`
- `{ "type": "program", "index": 0..7 }`

Native emits `state` and `telemetry` events. Native parameter state remains authoritative.

Additional native commands:

- `{ "type": "previousProgram" }` / `{ "type": "nextProgram" }`
- `{ "type": "savePreset" }` / `{ "type": "openPreset" }`

Factory program changes write the complete parameter set. User presets are JSON wrappers around the versioned APVTS XML state and are stored below the user's application-data directory in `openFAD/Rotator/Presets`.

## Windows validation

Run `D:\pluginval\pluginval.exe` against the generated VST3 bundle at strictness level 10. The reproducible command and the latest result location are recorded in `Docs/VALIDATION.md`. This validates the Windows VST3 contract only; it does not prove DAW, AU/AUv3, macOS, installer, or release-signing behavior.

For a Release artifact inventory and SHA-256 evidence file:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\write-artifact-manifest.ps1 -Configuration Release
```

The manifest covers every file inside the VST3 bundle plus the Standalone executable and WebView2 loader. It is evidence for comparison, not a code-signing or installer result.
