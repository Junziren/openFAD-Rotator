# Implementation status

## Implemented and verified on Windows

- Stable APVTS parameter IDs with normalized Choice decoding.
- Complete eight-program native factory bank.
- User preset save/load JSON wrappers around versioned APVTS XML state.
- MIDI Freeze with note overlap tracking and All Notes Off handling.
- Standalone-safe Dream delay advancement.
- Smoothed input trim, output trim, and dry/wet transitions.
- Authored speaker response manifests and model-specific DSP voicing.
- Embedded `Resources/Speakers/profiles.json` is parsed at processor construction and drives the cached DSP speaker profiles, with a built-in fallback for malformed resources.
- Manifest names, descriptions, and coefficients are included in the native state snapshot; the WebUI draws the selected model response curve from those values with an offline fallback.
- Distinct rotor structures, feed modes, render modes, quality modes, tail, room damping, and synced predelay behavior.
- Native-to-WebUI state synchronization for host automation and state restore.
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

## Deliberately deferred release gates

- Re-embedding and native/pluginval validation of the current WebGL2 thick-shell visual iteration after browser visual acceptance.

- Measured or licensed commercial speaker curves.
- Redistributable SOFA/HRTF data and convolution-based Studio processing.
- DAW scanning/automation/export behavior.
- macOS VST3, AU/AUv3, Logic Pro validation, signing, and notarization.
- Installer, upgrade/uninstall, clean-machine and offline-runtime validation.
- Steinberg VST3 Validator (an external validator path is not configured on this machine).
- Cross-machine performance profiling, allocation/deadline instrumentation, and long-run soak tests.
- Full AGPL/JUCE/third-party release notice audit and signed release artifacts.

The deferred items are release gates, not hidden runtime dependencies. The Windows VST3/Standalone build remains fully offline and uses the authored fallback response and generic binaural approximation until those assets and gates are accepted. See `Docs/VALIDATION.md` for the evidence and exact scope.
