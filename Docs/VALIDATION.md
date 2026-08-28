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
and lays out all parameter groups in two columns at standard/large editor
sizes. Groups remain visible instead of relying on disclosure/折叠 state; the
non-shrinking rack scrolls as one stable surface, while compact sizes fall back
to one column.

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

Result: passed. The regression covers 44.1/48/96 kHz, zero and irregular block sizes, neutral transparency, active-chain finite output, band-specific Doppler delay presence, independent Rotator/Doppler controls, 24 ms Doppler automation continuity, 24 ms speaker-model voicing transition continuity, 24 ms Render Mode/Model Bypass/Dream Bypass/Dream Freeze crossfades in both directions, smoothed Rotator Amount, signed-rate direction coast-through-zero, reverse-transition audio continuity, parameterised Binaural ITD/head-shadow spatial cues, 24 ms Binaural angle automation continuity, and NaN/Inf input isolation.

### DSP performance evidence

```powershell
build-vs/openFADRotator_DSPPerformanceTests_artefacts/Release/openFADRotator_DSPPerformanceTests.exe
```

Result: passed on this Windows x64 machine at 48 kHz for 64/128/256/512/1024-sample blocks. The latest measured p99 callback times were 0.0179/0.0545/0.0787/0.1746/0.3923 ms against 1.3333/2.6667/5.3333/10.6667/21.3333 ms deadlines; no non-finite output was observed after enabling live-path crossfades. This is a local Release benchmark, not a cross-machine real-time guarantee.

### DSP soak checks

```powershell
build-vs/openFADRotator_DSPSoakTests_artefacts/Release/openFADRotator_DSPSoakTests.exe
ctest --test-dir build-vs -C Release --output-on-failure -R openFADRotator_DSPSoakTests
```

Result: passed. The deterministic probe processed approximately 120.01 seconds at 48 kHz and 20.01 seconds at 96 kHz while cycling speed modes, direction reversals, Doppler amount, speaker models, room controls, Dream controls, and irregular block sizes. Both runs stayed finite and within the output safety bound.

### Processor audio-chain checks

```powershell
build-vs/openFADRotator_ProcessorTests_artefacts/Release/openFADRotator_ProcessorTests.exe
ctest --test-dir build-vs -C Release --output-on-failure -R openFADRotator_ProcessorTests
```

Result: passed. The processor-level probe checks the complete parameter ID contract, mono/stereo effect layouts, rejection of a disabled input bus, finite mono processing, factory program writes, gesture writes, project-state and user-preset round trips, denormalised Choice reads, independent `Doppler Amount` state, host BPM Sync response, per-instance state isolation, no-PlayHead processing, offline Dream-tail rendering after an impulse, and monotonic audio-process sequencing.

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

### Repeatable Windows script

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\validate-windows.ps1 -Configuration Release
```

Latest direct Release checks passed through manifest validation, WebUI build, native Release build, DSP regression, DSP performance, Processor audio-chain checks, DSP soak checks, artifact/Loader checks, and pluginval completion-marker verification. The script now completes `[1/9]` through `[9/9]`. The Release artifact hash manifest remains:

`build-vs/validation/artifact-manifest-Release-20260828-104433.json`

### Offline Windows Release package

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\package-windows-release.ps1 -Configuration Release
```

Result: passed. Package staging and ZIP contents were checked on August 28, 2026. The generated package is:

`build-vs/release-package/openFAD-Rotator-Release-20260828-104434.zip`

Package SHA-256:

`41ad3530f67725714cffa257d58797275edeb961a57a20410561ec8cdf6b36b6`

The bundle is offline after installation but still requires the Microsoft WebView2 Evergreen Runtime on the target machine; this is not a clean-machine installer result.

## Not yet verified

- Real DAW scanning, automation recording, project reload, offline export, and multi-instance behavior.
- macOS VST3/AU/AUv3 build, Logic Pro validation, signing, and notarization.
- Clean-machine/offline installer and WebView2 Runtime deployment.
- Cross-machine real-time deadline profiling, allocation evidence, and host-level long-run soak tests.
- Measured or licensed commercial speaker curves and redistributable SOFA/HRTF convolution; the current Binaural mode is a tested parameterised approximation, not SOFA convolution.
- Final license, notices, code signing, installer, and release hash audit.
