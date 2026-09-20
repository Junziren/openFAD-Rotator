# Acoustic Garden Interactive Study

Independent visual prototype for openFAD Rotator / Unpure Bloom.
This study follows the approved low-poly garden and pull-column direction,
not the FAD design skill. It does not load the native bridge or process audio.

## Run

From this directory:

```powershell
npm ci
npm run dev -- --port 5187 --strictPort
```

Open http://127.0.0.1:5187. Build with `npm run build`.
Run `npm test` with the dev server running and Google Chrome installed.

## Interaction

- Drag any of the four buildings or its label. Space expands horizontally;
  the other three rise vertically.
- Shift reduces drag sensitivity. Double-click restores the existing default.
- Label and column handles support arrow keys, Home/End, PageUp/PageDown.
- Numeric fields provide direct entry. Percent fields show 0-100 rather than 0-1.
- Escape cancels the current drag. Pointer cancellation, blur, hidden documents,
  and tab switches terminate dragging.
- Six tabs expose all 40 existing parameters. Continuous secondary parameters
  use real Three.js pull columns. Choices remain selects and booleans remain
  checkboxes to preserve their discrete meaning.
- Free rate is available in FREE mode; sync division is available in SYNC mode.
- Collapse the lower control bank to inspect the larger garden.
- Pause stops demonstration rotor animation and continuous frame scheduling.
- Save/load handles a separate visual-study JSON format, never plugin presets.

## Scope

The original parameter contract supplies IDs, defaults, options and labels.
No plugin source, parameter contract, bridge, DSP, presets or native build files
are changed. Group placement is UI-only; macros never overwrite secondary values.
The model/structure selections change local values, not cabinet geometry.
Audio demo, microphone, file playback, host presets, host menus,
DAW automation and live telemetry are deliberately not connected.
The lower drum uses a visual demonstration rate, not measured DSP telemetry.

The garden GLB is the actual Blender export from the parent asset directory.
Imported transform metadata drives building motion; independent pivots drive
demonstration rotation. Labels and precise readouts are DOM overlays.
The lower columns are separate runtime geometry rendered in a reserved control
bank. They are not baked into the Blender master.

## Verification

`tests/interaction.mjs` uses Playwright and Chrome to verify all 40 controls,
building and column dragging, fine adjustment, numeric entry, keyboard limits,
reset, conditional controls, tab persistence, snapshot roundtrip, bank collapse,
animation pixel changes, pause scheduling, nonblank rendering and viewport bounds.
Screenshots cover every group at 1100x760, 820x600 and 390x844.
Additional screenshots capture simultaneous macro extremes.
Results are written to `screenshots/test-report.json`.

This is browser-verified only, not native-plugin or DAW verified.
The dev server binds only to localhost. Production assets contain the GLB
and bundled JavaScript; no CDN, remote fonts or external textures are used.

## Dependencies

Three.js: MIT, see `node_modules/three/LICENSE`.
Lucide: ISC, see `node_modules/lucide/LICENSE`.
Vite, Playwright and pngjs are development tools; lockfile pins the resolved
dependency graph. A future plugin release must package applicable notices and
run its own native/offline distribution audit.

## Rendering and effects

The scene toolbar offers Original, Hologram, Comic and Cel render styles.
Styles affect both the imported garden and runtime pull columns, not audio
parameters or snapshot values. Original restores the source materials.
Hologram uses translucent scan lines and edges; Comic uses ink edges,
screen-space hatching and dots; Cel uses discrete lighting bands.
Variant materials are cached and replaced column edge geometry is disposed.

The effects toggle and intensity slider control a bounded 36-particle pool,
three band-colored base arcs, short trails and faint additive arc halos.
The legacy effects are restricted to the cabinet base instead of obscuring
the horn and drum. A separate spatial layer adds three expanding floor rings
and a brief footprint ring on directly adjusted macro buildings. Combined,
Legacy and Spatial modes allow independent comparison. Paused/reduced-motion
interaction does not spawn animated feedback.
These re-express the old GUI's visual categories in Three.js; they do not port
its WebGL bloom pipeline exactly. Their energy is a visual demonstration,
not an analyser or native audio telemetry. Pause/reduced motion freezes them,
and hidden documents stop scheduling frames.

The speaker bank places the model-dependent frequency response schematic to
the left of the pull columns, with a taller plot and relative dB grid. It uses
the original GUI formula and speaker profiles. It is not an editable EQ,
an exact DSP transfer function, or a measured spectrum; bypass/amount do not
rewrite the model's reference curve.

`tests/visuals.mjs` additionally checks four styles at three viewports,
shader errors, parameter non-mutation, EQ profile changes and effect toggling.

## Header and About

The original header's brand artwork, product name, publisher subtitle, S/M/L
density controls, reduced-motion toggle and independent About button are
preserved. Size controls affect the local control-bank density, not the host
window or DSP. The existing prototype snapshot/pause/reset commands remain
on desktop; snapshot/reset commands are hidden on narrow mobile previews.

Clicking the product name flips the title and opens a themed About dialog.
The dialog preserves publisher/author/project information and clearly labels
this as an unconnected prototype. Escape, close button and backdrop dismiss it;
Tab remains inside the dialog and focus returns to the initiating control.
Scene frame scheduling is suspended while About is open.

Header and About follow Original/Hologram/Comic/Cel styling. Hologram has a
small unlit emission contribution on mesh rim/scan bands and a restrained
title glow; no full-scene bloom or overlay obscures the cabinet.
Reduced motion disables the title/dialog transitions and continuous scene
animation without changing audio parameters.
`tests/about.mjs` verifies dialogs, focus, animation suspension, styles,
responsive size controls and reduced motion.
