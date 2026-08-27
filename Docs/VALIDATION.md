# Validation record

Last updated: 2026-08-25 (Windows, x64, Release)

## Verified

### WebUI

```powershell
cd WebUI
npm run build
```

Result: passed. The current production bundle uses the native WebGL2 renderer and `gl-matrix`; no Three.js dependency or Three.js bundle warning remains.

Browser visual validation covers the closed horn, drum, cabinet-panel and bass-basket meshes, the cutaway orthographic cabinet, MSAA resolve, screen-space outlines, moving wall shadows, the depth-correct floor contact shadow, compact `319 x 620` and expanded `879 x 1202` canvas rendering, camera drag, continuous animation, and zero page error/warning logs. `Horn Spread` was temporarily set to `1.00` for six captures spanning a complete horn revolution; the mouth rims retained visible clearance from the back, side and roof panels. A startup assertion independently checks the conservative maximum horizontal sweep radius against the cabinet interior. The product default was restored to `0.58` before the final build. This is browser evidence only; the current visual iteration has not yet been re-embedded into the native plugin.

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

Result: passed. The regression covers 44.1/48/96 kHz, zero and irregular block sizes, neutral transparency, active-chain finite output, and NaN/Inf input isolation.

### DSP performance evidence

```powershell
build-vs/openFADRotator_DSPPerformanceTests_artefacts/Release/openFADRotator_DSPPerformanceTests.exe
```

Result: passed on this Windows x64 machine at 48 kHz for 64/128/256/512/1024-sample blocks. The measured p99 callback times were 0.0138/0.0383/0.0577/0.1121/0.2377 ms against 1.3333/2.6667/5.3333/10.6667/21.3333 ms deadlines; no non-finite output was observed. This is a local Release benchmark, not a cross-machine real-time guarantee.

### Standalone native WebView

The final executable was cold-launched after a clean rebuild. The embedded page loaded from JUCE BinaryData without localhost, Node, Python, CDN, or remote font access. The checked visual path includes the speaker model, independent drum/horn rotors, counter-facing horns, telemetry, and control panels. The oblique-camera direction mapping was also checked: CW reads clockwise on the drum reference, CCW reverses it, and the horn rotor counter-rotates with its own speed ratio.

This native executable record predates the current WebGL2 thick-shell cabinet and stylized-shadow iteration. It remains valid for the recorded native artifact, but does not claim that the current browser visual has been embedded or pluginval-tested.

Direction-fix capture:

`build-vs/standalone-direction-fixed.png`

Frequency-curve capture:

`build-vs/standalone-frequency-curve.png`

### pluginval

```powershell
D:\pluginval\pluginval.exe `
  --validate "C:\Users\Administrator.CH-202110171028\Documents\ChatGPT\openFAD Rotator\build-vs\openFADRotator_artefacts\Debug\VST3\openFAD Rotator.vst3" `
  --strictness-level 10 `
  --timeout-ms 120000 `
  --verbose `
  --output-dir "D:\pluginval\results\openfad-rotator-20260825-final"
```

Result: exit code `0`. The log records completed tests for cold/warm open, editor, editor while processing, programs, parameters, state/background-thread safety, buses, audio processing at 44.1/48/96 kHz and block sizes 64/128/256/512/1024, editor automation, and parameter fuzzing.

Latest log:

`build-vs/validation/pluginval-20260825-182659/openFAD Rotator.vst3_25 Aug 2026 6,26,59pm.txt`

The optional Steinberg VST3 Validator test was skipped because no external validator executable path was configured.

### Repeatable Windows script

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Scripts\validate-windows.ps1 -Configuration Release
```

Latest direct Release checks passed through manifest validation, WebUI build, native Release build, DSP regression, DSP performance checks, artifact/Loader checks, and pluginval completion-marker verification. The Release artifact hash manifest is:

`build-vs/validation/artifact-manifest-Release-20260825-182831.json`

## Not yet verified

- DAW scanning, automation recording, project reload, offline export, and multi-instance behavior.
- macOS VST3/AU/AUv3 build, Logic Pro validation, signing, and notarization.
- Clean-machine/offline installer and WebView2 Runtime deployment.
- Long-run DSP/UI soak tests, real-time deadline profiling, and allocation evidence.
- Measured or licensed commercial speaker curves and redistributable SOFA/HRTF convolution.
- Final license, notices, code signing, installer, and release hash audit.
