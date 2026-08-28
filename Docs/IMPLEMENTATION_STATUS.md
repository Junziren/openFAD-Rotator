# Implementation status

## Implemented and verified on Windows

- Stable APVTS parameter IDs with normalized Choice decoding.
- Complete eight-program native factory bank.
- User preset save/load JSON wrappers around versioned APVTS XML state.
- MIDI Freeze with note overlap tracking and All Notes Off handling.
- Standalone-safe Dream delay advancement.
- Smoothed input trim, output trim, and dry/wet transitions.
- Authored speaker response manifests and model-specific DSP voicing.
- Speaker model cutoff, band gains, loudness calibration, and drive changes use a dedicated 24 ms ramp, so discrete model automation does not step the audio path.
- Band-specific rotor processing with causal fractional-delay Doppler modulation for the horn and drum radiators.
- Independent `Doppler Amount` parameter, appended after the existing parameter layout to preserve prior host automation/index ordering; `Rotator Amount = 0` no longer disables Doppler. The WebUI exposes it in its own `DOPPLER / 多普勒` module.
- Doppler amount automation uses a dedicated 24 ms smoothing ramp to avoid zipper/discontinuity artifacts during host recording or rapid UI moves.
- Signed rotor/drum rates with inertia-limited acceleration and zero-crossing direction reversal; audio continuity is covered by a regression probe.
- Embedded `Resources/Speakers/profiles.json` is parsed at processor construction and drives the cached DSP speaker profiles, with a built-in fallback for malformed resources.
- Manifest names, descriptions, and coefficients are included in the native state snapshot; the WebUI draws the selected model response curve from those values with an offline fallback.
- Distinct rotor structures, feed modes, render modes, quality modes, tail, room damping, and synced predelay behavior.
- Native-to-WebUI state synchronization for host automation and state restore.
- WebUI/native control alignment with a native program strip, exact factory
  program names, signal-path section labels, two-column parameter grids at
  standard/large sizes, and a non-shrinking scrollable rack for short editors.
- Sequence-protected native telemetry snapshots so phase, rate, meters, and band energy arrive as one coherent UI frame.
- Audio-thread-owned MIDI Freeze note table with message-thread clear requests applied at callback boundaries.
- Working program, preset, settings, bypass, freeze, advanced-control, keyboard, and fine-adjust UI paths.
- Resizable editor bounds from 820x600 to 1800x1200, with truthful FREE-RUN versus host LIVE status labels.
- WebView2 on Windows with a bundled `WebView2Loader.dll`; default platform WebKit backend on Apple/Linux builds.
- Native WebGL2 dual-rotor model using `gl-matrix`, with independent drum/horn axes, counter-facing horns, counter-rotating motion, and direction-synchronised animation.
- Closed double-wall horn, drum, cabinet-panel and bass-basket topology with sealed openings, non-overlapping mechanical gaps, a cutaway orthographic cabinet, faceted lighting, MSAA resolve, screen-space outlines, animated hard-edge wall shadows and a depth-correct floor contact shadow decal.
- Shared horn/cabinet geometry constants and a startup sweep-clearance assertion covering the full `Horn Spread` range, so cabinet edits cannot silently reintroduce rotor-wall penetration.
- WebUI production build with `npm run build`.
- Windows Debug VST3 and Standalone build with `openFADRotator_All`.
- `pluginval` strictness level 10, including editor, automation, processing, buses, programs, state, and fuzz tests.
- Standalone cold launch with the embedded WebView2 page and offline BinaryData resources.
- Repeatable `Scripts/validate-windows.ps1` smoke path for manifest, WebUI, native artifacts, WebView2 loader, and pluginval completion.
- Release DSP performance evidence at 48 kHz across 64/128/256/512/1024-sample blocks, with p99 callback timing and finite-output checks.
- Processor host-contract checks cover parameter ID uniqueness, mono/stereo bus negotiation, program changes, gesture writes, project-state and user-preset round trips, and host BPM Sync response.
- Deterministic DSP soak checks cover 120 seconds at 48 kHz plus 20 seconds at 96 kHz while cycling speed, direction, Doppler, speaker, room, and Dream parameters.
- Audited offline Windows Release bundle contains VST3, Standalone, WebView2 loader, license/notices, validation documents, an artifact manifest, and SHA-256 package metadata.
- Installed Release VST3 copy revalidated with `D:\pluginval\pluginval.exe` at strictness level 10.
- Installed Release VST3 copy revalidated after adding `Doppler Amount`; pluginval parameter, state, automation, editor, and fuzz passes include the new control.
- Latest Release Standalone was cold-launched from the rebuilt artifact; the embedded WebGL2 visual and `DOPPLER` control were visible, and a native slider drag from `1.00` to `0.50` synchronized through APVTS before restoring the default.

## Deliberately deferred release gates

- Measured or licensed commercial speaker curves.
- Redistributable SOFA/HRTF data and convolution-based Studio processing.
- Real DAW scanning, automation recording, project reload, offline export, and multi-instance behavior.
- macOS VST3, AU/AUv3, Logic Pro validation, signing, and notarization.
- Installer, upgrade/uninstall, clean-machine and offline-runtime validation.
- Steinberg VST3 Validator (an external validator path is not configured on this machine).
- Cross-machine performance profiling, allocation/deadline instrumentation, and host-level long-run soak tests.
- Full AGPL/JUCE/third-party release notice audit and signed release artifacts.

The deferred items are release gates, not hidden runtime dependencies. The Windows VST3/Standalone build remains fully offline and uses the authored fallback response plus a parameterised HRTF-style approximation until measured curves and a redistributable SOFA asset are accepted. See `Docs/VALIDATION.md` for the evidence and exact scope.
