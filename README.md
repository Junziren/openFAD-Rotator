# openFAD Rotator

`openFAD Rotator` is a JUCE-based VST3/AUv3 audio effect with a native WebGL2 visual workspace. Its first implementation combines original speaker-response archetypes, a linked dual-rotor processor, and a warm diffusion/microshift tail.

## Current implementation

- JUCE processor/editor with mono and stereo input support and stereo output.
- Parameter ABI in `Source/Parameters.*` and state schema version `1`.
- Realtime model, rotor, room-reflection and Dream processing in `Source/RotatorDSP.*`.
- MIDI note hold/release control for transient Dream Freeze.
- Offline React/WebGL2 WebUI using `gl-matrix`, bundled through JUCE BinaryData and the WebView2/WKWebView resource provider.
- Eight complete factory programs represented by the native program bank and `Presets/factory.json`.
- Native preset save/load files under the user application data directory.
- Native parameter listeners that keep WebUI state synchronized with host automation and project restore.
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

For a repeatable Windows smoke build, manifest check, artifact check, pluginval run, DSP regression, and Release performance check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\validate-windows.ps1 -Configuration Release
```

Use `-SkipPluginval` when only the local build and resource checks are needed.

On Windows, the build requires the WebView2 SDK through JUCE and copies `Resources/WebView2/WebView2Loader.dll` beside the generated Standalone and VST3 binaries. The target machine also needs the Microsoft WebView2 Evergreen Runtime; the loader DLL and the runtime are separate dependencies.

The generated Release VST3 is under `build-vs/openFADRotator_artefacts/Release/VST3/`. The Standalone executable is under the sibling `Standalone` directory.

## Resource and runtime boundary

Release builds do not use localhost, npm, Python, a CDN, remote fonts, or files next to the installed plugin. The WebUI is served only from the compiled BinaryData resource provider. WebView2 is selected explicitly on Windows and WKWebView is used by JUCE on Apple platforms.

## Product identifiers

- Product: `openFAD Rotator`
- Bundle ID: `org.openfad.rotator`
- Manufacturer code: `OFad`
- Plugin code: `ORot`
- State schema: `1`

## Known limits of this first pass

The current DSP remains a playable prototype: speaker manifests are authored response archetypes rather than measured commercial curves, and the Binaural mode is a generic approximation until a redistributable HRTF asset and convolution path are added. Windows VST3/Standalone and pluginval are verified; DAW behavior, macOS AU/AUv3, performance profiling, installers, signing, and notarization remain release gates.
