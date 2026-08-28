# openFAD Rotator

`openFAD Rotator` is a JUCE-based VST3/AUv3 audio effect with a native WebGL2 visual workspace. Its first implementation combines original speaker-response archetypes, a linked dual-rotor processor, and a warm diffusion/microshift tail.

## Current implementation

- JUCE processor/editor with mono and stereo input support and stereo output.
- Parameter ABI in `Source/Parameters.*` and state schema version `1`.
- Realtime model, rotor, room-reflection and Dream processing in `Source/RotatorDSP.*`.
- Rotor DSP splits low/mid/high driver bands and applies causal variable fractional-delay Doppler modulation from the signed horn/drum motion. `Rotator Amount` (amplitude/pan motion) and `Doppler Amount` (fractional-delay pitch motion) are independent controls; Doppler automation uses a 24 ms smoothing ramp and inertia-limited signed rates coast through zero on direction changes.
- Render-mode, model-bypass, and Dream-bypass automation crossfade between live paths over 24 ms, while model/rotator amount changes use matching bounded ramps to avoid clicks during host recording or rapid UI moves.
- Dream Freeze ramps its input injection and feedback loop over the same 24 ms window, including MIDI-held freeze transitions.
- MIDI note hold/release control for transient Dream Freeze.
- Offline React/WebGL2 WebUI using `gl-matrix`, bundled through JUCE BinaryData and the WebView2/WKWebView resource provider.
- Unpure Bloom family UI with the shared paper/chrome palette, local Bloom mark,
  Fuse-style rotary controls, cursor-following parameter explanations, and
  responsive S/M/L editor sizing.
- Eight complete factory programs represented by the native program bank and `Presets/factory.json`.
- Native preset save/load files under the user application data directory.
- Native parameter listeners that keep WebUI state synchronized with host automation and project restore.
- DSP regression and performance targets cover Doppler delay presence, reverse-transition continuity, discrete-path crossfades, speaker-model transition continuity, finite-output containment, per-instance/offline processor behavior, and callback timing.
- Versioned authored speaker-response manifests under `Resources/Speakers/`.
- The embedded speaker manifest is parsed at startup and is the source of truth for the model curve coefficients, with built-in fallback defaults.
- The native manifest metadata is sent with the editor state, and the WebUI renders the selected model's normalized 20 Hz to 20 kHz response curve.
- Windows WebView2 loader bundled beside the Standalone executable and VST3 binary.
- Independent visual drum/horn rotors with counter-facing horns, opposite physical rotation directions, and CW/CCW synchronisation.
- Closed double-wall horn, drum, cabinet-panel and bass-basket meshes with sealed rims, cutaway architecture, faceted lighting, MSAA resolve, screen-space outlines and animated hard-edge wall shadows.

## Build

The frontend is built first, then CMake embeds `WebUI/dist` into the plugin binary.

```powershell
cd WebUI
npm install
npm run build
cd ..

cmake -S . -B build-vs -G "Visual Studio 18 2026" -A x64 `
  -DJUCE_PATH="C:/path/to/JUCE"
cmake --build build-vs --config Release --target openFADRotator_All
```

For a repeatable Windows smoke build, manifest check, artifact check, pluginval run, DSP regression, DSP and full-Processor Release performance, DSP/Processor callback allocation checks, Processor host-contract check, VST3 bundle host smoke, package/install smoke, release-package audit, and long-run DSP soak:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\validate-windows.ps1 -Configuration Release
```

Use `-SkipPluginval` when only the local build and resource checks are needed.

The release audit can also be run independently against an existing package
staging directory. It checks the offline WebUI boundary, package metadata,
artifact hashes, third-party license hashes, and an optional pluginval log:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\audit-release.ps1 `
  -BuildDir .\build-vs `
  -Configuration Release `
  -PackageRoot .\build-vs\validation\install-smoke-Release-<stamp> `
  -PluginvalResults .\build-vs\validation\pluginval-<stamp>
```

After validation, create the offline Windows release bundle with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\package-windows-offline-release.ps1 -Configuration Release
```

The generated ZIP includes the Microsoft WebView2 Evergreen Offline x64
installer and the Microsoft VC++ x64 Redistributable, so a disconnected Windows
machine can install the shared runtimes before the product files.

Extract the versioned directory and run `Install-openFAD-Rotator.cmd` as an
administrator. It verifies dependency hashes, installs the bundled runtimes,
copies the VST3 and Standalone files, creates the factory preset directory, and
registers `Unpure Bloom / openFAD Rotator` in Windows Apps & Features. Use
`Uninstall-openFAD-Rotator.cmd` to remove the product while keeping shared
runtimes and user presets.

Apple build configuration lives in `.github/workflows/macos-build.yml`; it is
configured for JUCE 8.0.12 VST3/AUv3/Standalone builds and CTest, but still
requires a hosted macOS run and Logic Pro/device validation.

On Windows, the build requires the WebView2 SDK through JUCE and copies `Resources/WebView2/WebView2Loader.dll` beside the generated Standalone and VST3 binaries. The target machine also needs the Microsoft WebView2 Evergreen Runtime; the loader DLL and the runtime are separate dependencies.

The generated Release VST3 is under `build-vs/openFADRotator_artefacts/Release/VST3/`. The Standalone executable is under the sibling `Standalone` directory. The offline release ZIP and its SHA-256 sidecar are written to `build-vs/offline-release/`.

## Resource and runtime boundary

Release builds do not use localhost, npm, Python, a CDN, remote fonts, or files next to the installed plugin. The WebUI is served only from the compiled BinaryData resource provider. WebView2 is selected explicitly on Windows and WKWebView is used by JUCE on Apple platforms.

## Product identifiers

- Product: `openFAD Rotator`
- Publisher: `Unpure Bloom`
- Bundle ID: `org.openfad.rotator`
- Manufacturer code: `OFad`
- Plugin code: `ORot`
- State schema: `1`

## Known limits of this first pass

The current DSP remains a playable prototype: speaker manifests are authored response archetypes rather than measured commercial curves, and the Binaural mode uses a lightweight parameterised HRTF-style approximation (short ITD, frequency-dependent head shadow and crossfeed) until a redistributable HRTF asset and convolution path are added. Windows VST3/Standalone, the embedded WebGL2 visual, pluginval, local host-contract checks, local performance evidence, and deterministic DSP soak are verified; real DAW behavior, macOS AU/AUv3, cross-machine profiling, clean-machine installers, signing, and notarization remain release gates.
