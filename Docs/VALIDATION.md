# Validation record

Last updated: 2026-08-28 (Windows, x64, Release)

## Verified

### WebUI

```powershell
cd WebUI
npm run build
```

Result: passed. The current production bundle uses the native WebGL2 renderer and `gl-matrix`; no Three.js dependency or Three.js bundle warning remains.

The control-rack pass adds a native-only program strip sourced from the C++
factory bank, keeps browser-only audio transport controls out of the plugin,
and lays out all parameter groups in two columns across the editor sizes.
Groups remain visible instead of relying on disclosure/折叠 state; the
non-shrinking rack scrolls as one stable surface, and compact/mobile layouts
retain the same two-column parameter rhythm below the visual surface.

Browser visual validation covers the closed horn, drum, cabinet-panel and bass-basket meshes, the cutaway orthographic cabinet, MSAA resolve, screen-space outlines, moving wall shadows, the depth-correct floor contact shadow, the selected-model response curve, the dedicated `DOPPLER / 多普勒` module, compact `319 x 620` and expanded `879 x 1202` canvas rendering, camera drag, continuous animation, and zero page error/warning logs. `Horn Spread` was temporarily set to `1.00` for six captures spanning a complete horn revolution; the mouth rims retained visible clearance from the back, side and roof panels. A startup assertion independently checks the conservative maximum horizontal sweep radius against the cabinet interior. The product default was restored to `0.58` before the final build.

Manifest smoke test:

```powershell
cd WebUI
npm run validate:manifest
```

Result: passed. Eight profiles, schema version `1`, unique IDs, finite coefficients, and bounded filter/gain values were checked.

### Native build

```powershell
cmake --build build-vs --config Release --target openFADRotator_All
```

Result: passed. Outputs include the Release VST3 bundle, Standalone executable, and copied `WebView2Loader.dll`.

### DSP regression

```powershell
build-vs/openFADRotator_DSPTests_artefacts/Release/openFADRotator_DSPTests.exe
ctest --test-dir build-vs -C Release --output-on-failure -R openFADRotator_DSPTests
```

Result: passed. The regression covers 44.1/48/88.2/96/192 kHz, zero and irregular block sizes, neutral transparency, active-chain finite output, band-specific Doppler delay presence, independent Rotator/Doppler controls, 24 ms Doppler automation continuity, 24 ms speaker-model voicing transition continuity, 24 ms Render Mode/Model Bypass/Dream Bypass/Dream Freeze crossfades in both directions, smoothed Rotator Amount, signed-rate direction coast-through-zero, reverse-transition audio continuity, parameterised Binaural ITD/head-shadow spatial cues, 24 ms Binaural angle automation continuity, and NaN/Inf input isolation.

### DSP performance evidence

```powershell
build-vs/openFADRotator_DSPPerformanceTests_artefacts/Release/openFADRotator_DSPPerformanceTests.exe
```

Result: passed on this Windows x64 machine at 44.1/48/88.2/96/192 kHz for 64/128/256/512/1024-sample blocks. Across the matrix, the worst observed p99 was 0.4520 ms at 44.1 kHz / 1024 samples against a 23.2200 ms deadline (0.0195x); no non-finite output was observed after enabling live-path crossfades. This is a local Release benchmark, not a cross-machine real-time guarantee.

### Full Processor performance evidence

```powershell
cmake --build build-vs --config Release --target openFADRotator_ProcessorPerformanceTests
build-vs/openFADRotator_ProcessorPerformanceTests_artefacts/Release/openFADRotator_ProcessorPerformanceTests.exe
```

Result: passed on this Windows x64 machine at 44.1/48/88.2/96/192 kHz for
64/128/256/512/1024-sample blocks. The benchmark measures the complete
`OpenFADRotatorAudioProcessor::processBlock()` path, including APVTS reads,
host PlayHead lookup, parameter transitions, and finite-output checks. The
worst observed p99 was `0.3070 ms` at 88.2 kHz / 1024 samples against an
`11.6100 ms` deadline (`0.0264x`). This is local Release evidence, not a
cross-machine scheduler guarantee.

### DSP callback allocation check

```powershell
cmake --build build-vs --config Release --target openFADRotator_DSPAllocationTests
build-vs/openFADRotator_DSPAllocationTests_artefacts/Release/openFADRotator_DSPAllocationTests.exe
```

Result: passed. After `prepare`, the probe warmed the DSP and then processed
4096 blocks while changing speed, direction, model, render, Doppler, Rotator,
Dream, and Freeze parameters. The Release executable reported
`allocations=0`; this is a callback allocation probe, not a substitute for a
host profiler or cross-machine deadline evidence.

### DSP soak checks

```powershell
build-vs/openFADRotator_DSPSoakTests_artefacts/Release/openFADRotator_DSPSoakTests.exe
ctest --test-dir build-vs -C Release --output-on-failure -R openFADRotator_DSPSoakTests
```

Result: passed. The deterministic probe processed approximately 120.01 seconds at 48 kHz and 20.01 seconds at 96 kHz while cycling speed modes, direction reversals, Doppler amount, speaker models, room controls, Dream controls, and irregular block sizes. Both runs stayed finite and within the output safety bound.

### Full Processor callback allocation check

```powershell
cmake --build build-vs --config Release --target openFADRotator_ProcessorAllocationTests
build-vs/openFADRotator_ProcessorAllocationTests_artefacts/Release/openFADRotator_ProcessorAllocationTests.exe
```

Result: passed. After preparation, the probe processed 4096 blocks through the
real `OpenFADRotatorAudioProcessor::processBlock()` path while exercising APVTS
raw reads, host PlayHead tempo/transport lookup, MIDI Freeze note-on/note-off
events, speed and direction changes, speaker/render/Doppler/Rotator changes,
Dream bypass/freeze transitions, and listener-angle automation. The Release
executable reported `allocations=0`. This is callback evidence on the current
Windows x64 machine, not a cross-machine profiler or a full DAW scheduler test.

### Processor audio-chain checks

```powershell
build-vs/openFADRotator_ProcessorTests_artefacts/Release/openFADRotator_ProcessorTests.exe
ctest --test-dir build-vs -C Release --output-on-failure -R openFADRotator_ProcessorTests
```

Result: passed. The processor-level probe checks the complete parameter ID contract, mono/stereo effect layouts, rejection of a disabled input bus, finite mono processing, factory program writes, gesture writes, project-state and user-preset round trips, denormalised Choice reads, independent `Doppler Amount` state, host BPM Sync response, per-instance state isolation, no-PlayHead processing, offline Dream-tail rendering after an impulse, and monotonic audio-process sequencing.

### VST3 host smoke wrapper

```powershell
cmake --build build-vs --config Release --target openFADRotator_VST3HostSmoke
build-vs/openFADRotator_VST3HostSmoke_artefacts/Release/openFADRotator_VST3HostSmoke.exe `
  "build-vs/openFADRotator_artefacts/Release/VST3/openFAD Rotator.vst3"
ctest --test-dir build-vs -C Release --output-on-failure -R openFADRotator_VST3HostSmoke
```

Result: passed. JUCE's headless VST3 host adapter scanned and instantiated the
Release bundle, checked its stereo effect buses, all 40 product parameters and
eight factory programs, exercised parameter gestures/automation, state
round-trip, offline audio and Dream tail rendering, and verified that two
instances keep independent state. The adapter exposes additional VST3 host
parameters (including Bypass, Program, and MIDI CC mappings), so the reported
parameter count is intentionally larger than the product's 40 audio controls.
This is a real bundle-loading host smoke test, not a substitute for loading the
plugin in a full DAW and recording automation or exporting a project.

### Standalone native WebView

The current Release executable was cold-launched after rebuilding the WebUI and native targets. The embedded page loaded from JUCE BinaryData without localhost, Node, Python, CDN, or remote font access. The checked visual path includes the current WebGL2 thick-shell cabinet, stylized lighting/shadows, speaker model and response curve, independent drum/horn rotors, counter-facing horns, telemetry, and control panels. The native accessibility tree exposed the dedicated `DOPPLER / 多普勒` module; a slider drag changed it from `1.00` to `0.50` and the value was restored to `1.00` before closing the window.

Direction-fix capture:

`build-vs/standalone-direction-fixed.png`

Frequency-curve capture:

`build-vs/standalone-frequency-curve.png`

### pluginval

```powershell
D:\pluginval\pluginval.exe `
  --validate "C:\Users\Administrator.CH-202110171028\Documents\ChatGPT\openFAD Rotator\build-vs\openFADRotator_artefacts\Release\VST3\openFAD Rotator.vst3" `
  --strictness-level 10 `
  --timeout-ms 120000 `
  --verbose `
  --output-dir "D:\pluginval\results\openfad-rotator-20260825-final"
```

Result: exit code `0`. The log records completed tests for cold/warm open, editor, editor while processing, programs, parameters, state/background-thread safety, buses, audio processing at 44.1/48/96 kHz and block sizes 64/128/256/512/1024, editor automation, and parameter fuzzing.

The installed system copy was also validated after the Release artifact was copied to:

`C:\Program Files\Common Files\VST3\openFAD Rotator.vst3`

The installed-copy run completed at strictness level `10` with process exit code `0`; its completion log is under:

`build-vs/validation/pluginval-installed-process/pluginval.log`

The current installed-copy run also completed at strictness level `10` with process exit code `0` after adding `Doppler Amount`. Its log is under:

`build-vs/validation/pluginval-doppler-installed/`

The final installed bundle contains the same Release binary as the build artifact (SHA-256 match: `80D2E20BEEF5EA2A517A1AEDFD9D427FF126C33D7D90271ACA3C543E0A21BDE4`) and the final strictness-level `10` run found one plugin. The latest installed-copy log is under:

`build-vs/validation/pluginval-doppler-installed-20260828-final2/openFAD Rotator.vst3_28 Aug 2026 9,08,32am.txt`

The latest build-artifact run completed at `10:42:37` on August 28, 2026 after the dedicated Doppler module and WebUI response curve were embedded:

`build-vs/validation/pluginval-20260828-104237/openFAD Rotator.vst3_28 Aug 2026 10,42,37am.txt`

The post-alignment Release VST3 run completed at `12:33:45` on August 28,
2026 at strictness level `10`; it found no `FAIL` or `ERROR` lines and covered
the updated embedded editor, all 40 audio parameters, Doppler, and Program:

`build-vs/validation/pluginval-ui-two-column-20260828/openFAD Rotator.vst3_28 Aug 2026 12,33,45pm.txt`

After removing the disclosure/folding interaction and keeping every parameter
group visible, the final rebuilt Release VST3 was rerun at strictness level
`10`; it again completed with no `FAIL` or `ERROR` lines:

`build-vs/validation/pluginval-ui-two-column-20260828-final/openFAD Rotator.vst3_28 Aug 2026 12,48,46pm.txt`

After adding the bounded discrete-path crossfades, the latest Release VST3 run
completed at `13:39:27` on August 28, 2026 at strictness level `10`; it again
found no `FAIL` or `ERROR` lines:

`build-vs/validation/pluginval-20260828-133927/`

The optional Steinberg VST3 Validator test was skipped because no external validator executable path was configured.

The latest repeatable validation run on August 28, 2026 produced pluginval
output under `build-vs/validation/pluginval-20260828-200535/`.
The completion log is:

`build-vs/validation/pluginval-20260828-200535/openFAD Rotator.vst3_28 Aug 2026 8,05,35pm.txt`

After overwriting the system VST3 install directory with the current Release
bundle, the installed copy was validated again at strictness level `10`. The
completion marker was present and the log contained no `FAIL` or `ERROR` lines:

`build-vs/validation/pluginval-installed-20260828-203841/openFAD Rotator.vst3_28 Aug 2026 8,38,41pm.txt`

The installed binary matches the Release artifact byte-for-byte (SHA-256:
`41F3FA89B10397A1D24EE9D66AF3385A3EF35758BECED5F19ADDFE8711872F77`).

The About surface includes these verified destinations:

- Author: `https://github.com/Junziren`
- Project: `https://github.com/Junziren/openFAD-Rotator`
- openFAD initiative: `https://fadrecords.com/openfad/`

The embedded editor sends these clicks through the `openExternal` native bridge;
the native side allowlists only the three destinations above, while the offline
package audit rejects other external network URLs in the WebUI bundle.

The post-link installed-copy pluginval run completed with the normal fuzz-test
completion marker and no `FAIL` or `ERROR` lines. Its log is under:

`build-vs/validation/pluginval-about-links-installed-20260828-221818/openFAD Rotator.vst3_28 Aug 2026 10,18,18pm.txt`

### Repeatable Windows script

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\validate-windows.ps1 -Configuration Release
```

Latest direct Release checks passed through manifest validation, WebUI build, native Release build, DSP regression, DSP performance, full Processor performance, DSP callback allocation, Processor audio-chain checks, full Processor callback allocation, VST3 host smoke loading with offline WAV export/state reload, package/install smoke, DSP soak checks, release-package audit, artifact/Loader checks, and pluginval completion-marker verification. The script now completes `[1/15]` through `[15/15]`. The latest isolated package/install smoke ZIP is:

`build-vs/validation/install-smoke-Release-20260828-200531.zip`

Package SHA-256 for that smoke run:

`22668c4ed3fe42404f086adc13054ec02941a755252aed4e443132c51b5dba25`

The package contains the Release artifact hash manifest at:

`build-vs/validation/install-smoke-Release-20260828-200531/openFAD Rotator/release-artifact-manifest.json`

### Release package audit

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\audit-release.ps1 `
  -BuildDir .\build-vs `
  -Configuration Release `
  -PackageRoot .\build-vs\validation\install-smoke-Release-20260828-200531 `
  -PluginvalResults .\build-vs\validation\pluginval-20260828-200535
```

Result: passed. The audit verified the package metadata, VST3/Standalone
structure, artifact manifest hashes, all third-party license hashes, the
offline WebUI boundary (allowing only JUCE's local bridge and static namespace
URLs), and the pluginval completion marker with no `FAIL` or `ERROR` lines.

### Offline Windows Release package

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\package-windows-offline-release.ps1 -Configuration Release
```

Result: the ZIP staging path now includes the VST3/Standalone payload, the
WebView2 Evergreen Offline x64 installer, the VC++ x64 Redistributable, their
SHA-256 manifest, and elevated install/uninstall command files. The generated
archive and hash sidecar are written to `build-vs/offline-release/` after the
offline package command completes.

This is a ZIP-based offline installer bundle, not a single EXE. A clean
disconnected VM run and upgrade/repair behavior remain release gates.

### Windows package/install smoke

The portable package still includes `Scripts/install-windows-release.ps1` for
package-root smoke tests. The offline release adds
`Install-openFAD-Rotator.cmd`, which verifies dependency hashes, installs the
bundled WebView2/VC++ runtimes, then invokes the package-root installer. The
offline installer also registers an uninstall entry and keeps shared runtimes
and user presets during removal.

This proves the ZIP layout and script contract; it does not yet prove elevation,
runtime deployment on a clean disconnected VM, or upgrade/repair behavior.

## Not yet verified

- Real DAW scanning, automation recording, project reload, offline export, and multi-instance behavior. The local JUCE host smoke wrapper covers these paths in a deterministic adapter, but is not a substitute for a full DAW session.
- macOS VST3/AU/AUv3 build, Logic Pro validation, signing, and notarization.
- Clean disconnected VM install/upgrade/repair and WebView2/VC++ deployment.
- Cross-machine real-time deadline profiling and host-level long-run soak tests;
  local Release allocation evidence is covered above.
- Measured or licensed commercial speaker curves and redistributable SOFA/HRTF convolution; the current Binaural mode is a tested parameterised approximation, not SOFA convolution.
- Final human/legal license and notice review, code signing, and signed release audit.
