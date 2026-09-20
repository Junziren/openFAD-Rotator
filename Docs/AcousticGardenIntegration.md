# Acoustic Garden VST3 Integration

Verified on Windows on 2026-09-20.

## Production integration

- `WebUI/src/main.tsx` loads the garden interface. Assets, fonts and GLB are
  embedded through the existing JUCE resource provider; no development server
  is needed by the plugin.
- Native parameter gestures drive all 40 business parameters. Parameter IDs,
  ranges, defaults, eight factory programs and preset schema version 1 remain
  unchanged. Host updates do not echo back as user gestures.
- Rotor and drum animation use native telemetry. Audio processing mathematics
  are unchanged; DSP modifications only publish additional telemetry.
- Original, hologram, comic and cel styles apply to the interface. About opens
  from the rotating product title. Prototype pause/reset/import/export and
  duplicate About entrances were removed.
- The preset header provides factory selection, previous/next, a dirty marker,
  and native Save As / Load dialogs. User presets use `.ofr.json`.
- Saves use temporary-file replacement. Invalid product/schema, malformed state,
  duplicate/unknown IDs and nonfinite/out-of-range values are rejected before
  applying a preset. Legacy partial states remain accepted.
- Browser-only previews are disconnected/read-only, not simulated native hosts.

## Verification

- Release VST3 and Standalone builds passed.
- Processor contract tests passed, including named preset round-trip and invalid
  preset rejection without state mutation.
- Processor allocation test: 4096 callback blocks, zero allocations.
- DSP regression tests passed.
- VST3 host smoke passed: eight programs, state reload and offline audio export.
- Pluginval strictness 10 completed with no failure markers in its log.
- Mock bridge tests passed at 1100x760, 820x600 and 390x844 across four styles:
  gestures/cancellation, host updates, presets, numeric Escape and render suspension.
- Real embedded WebView2 test passed: local GLB, 40 parameters, native gestures,
  preset selection/reselection, styles, About suspension and drum telemetry.
- Native Save/Open dialogs were exercised with a full preset round-trip.
- Release audit, speaker manifest validation and third-party license collection
  passed (12 license entries).

Evidence is under `build-vs/validation/garden-browser`, `garden-native`,
`garden-pluginval` and `third-party-licenses`.

## Reproduction and outputs

Run `npm run test:garden` from WebUI with its Vite server on port 5188.
Run `npm run test:garden:native` against a test Standalone launched with a
temporary WebView2 CDP port 9231. Do not enable debugging in distributed launches.

Outputs:

- `build-vs/openFADRotator_artefacts/Release/VST3/openFAD Rotator.vst3`
- `build-vs/openFADRotator_artefacts/Release/Standalone/openFAD Rotator.exe`

Keep the complete VST3 bundle and its bundled runtime dependencies together.
The original prototype under `Design/ArchitecturalGarden/Prototype` is retained.

## Remaining release checks

On 2026-09-20 the Windows system VST3 and Standalone were installed using
`Scripts/install-windows-release.ps1`. Previous bundles were backed up under
`build-vs/install-backups/20260920-105710`. All three installed VST3 bundle files
match the canonical build by SHA-256. The installed VST3 passed host smoke,
offline export/state reload and pluginval strictness 10 (log under
`build-vs/validation/garden-installed-pluginval`).

Actual DAW project automation, host parameter context menus and clean-machine
installation have not been validated in this integration pass. macOS validation
is recorded separately by the GitHub Actions run for the integration commit.
