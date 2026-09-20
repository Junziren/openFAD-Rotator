# Acoustic Garden: Stage One

Original Blender model and composition study for openFAD Rotator.
This directory is independent of the plugin build. No plugin code, audio
algorithm, parameter, preset, bridge, or production resource was changed.

## Start here

| File | Purpose |
| --- | --- |
| `AcousticGarden.blend` | Editable master, component hierarchy, cameras, lights and three macro poses |
| `previews/overview.png` | Labeled overall composition at the middle pose |
| `renders/speaker-detail.png` | Isolated rotary cabinet close-up |
| `previews/macro-states.png` | Low / middle / high comparison with identical camera and lighting |
| `previews/viewport-1100x760.png` | Default editor size, toolbar and utility space reserved |
| `previews/viewport-820x600.png` | Minimum editor size, toolbar and utility space reserved |
| `exports/acoustic-garden.glb` | Complete garden with one synchronized macro-pose animation |
| `exports/rotary-speaker.glb` | Separate cabinet, centered at the origin and grounded |

The viewport images are composition proofs, not screenshots of an implemented
GUI. Labels are composited from projected model bounds. They are deliberately
not baked into the meshes.

## Editing the Blender master

Created and checked with Blender 5.2.2 LTS.

- The initial camera is `CAMERA.Garden_Isometric`; the master opens at frame 51.
- Timeline marker 1: LOW, all four visual macro values at 0%.
- Timeline marker 51: MID, all four values at 50%.
- Timeline marker 101: HIGH, all four values at 100%.
- Scene rate: 25 fps. The animation is a preview, not a plugin parameter link.
- Edit `01.Character_Tower`, `02.Motion_Pavilion`, `03.Space_Bridge` and
  `04.Dream_Terraces` under `Garden.asset`.
- Editable source meshes stay separate. Export copies are batched by material
  and semantic parent to reduce mesh primitives without flattening moving parts.
- `Horn.pivot_Z` and `Drum.pivot_Z` are independent pivots. They have no automatic
  rotation animation in this study, so macro comparisons remain directly
  comparable.
- Blender is Z-up; exported glTF is Y-up. The pivot names refer to the Blender
  axes. Explicit `rotation_axis_blender` / `rotation_axis_gltf` metadata prevents
  interpreting the source name as a runtime axis.
- All control objects carry stable `control_id` metadata. Moving objects also
  declare their source transform property, source axis and low/high endpoints.
- Moving parts use ordinary object transforms, not runtime Python drivers,
  armatures, shape keys, external images or texture dependencies.

The cabinet references the recognizable upper horn / fixed downward-facing
woofer / lower rotating drum arrangement, with an original cutaway exterior.
The second horn is a visual counterbalance. This is a stylized model, not a
manufacturing drawing or a claim of commercial-speaker acoustic accuracy.
All architecture, meshes and materials were authored for this workspace.
There are no imported game models, third-party texture packs or brand logos.

## Verification

Read the machine-generated reports for exact values and hashes:

- `validation.json`: all 81 combinations of four macros at 0/50/100%; projected
  control/cabinet separation and margins; source mesh manifoldness and positive
  volume; conservative rotating-part sweep clearance; responsive framing.
- `export-validation.json`: reloads the actual GLB files into a fresh Blender
  scene, compares all three poses to the master, verifies pivot origins and
  macro metadata, and checks the standalone cabinet is centered and grounded.
- `preview-validation.json`: verifies both editor sizes, label separation and
  margins against full pose-envelope bounds, nonblank/distinct renders,
  source-versus-GLB rendered-pixel comparison, GLB resource independence, mesh
  budgets and SHA-256 hashes.

Current geometry budgets:

| Asset | Triangles | Mesh primitives | Animation clips |
| --- | ---: | ---: | ---: |
| Garden, including cabinet | 10,960 | 50 | 1 |
| Standalone cabinet | 5,056 | 12 | 0 |

Both GLBs together are under 1 MiB. Mesh primitive counts are not a measured
WebView draw-call or frame-rate result. No runtime performance, live dragging,
DAW interaction, host automation or audio behavior is claimed as tested here.

## Reproduce

From this repository root, using the installed Blender executable:

```powershell
& 'D:\SteamLibrary\steamapps\common\Blender\blender.exe' --background --factory-startup --python-exit-code 1 --python 'Design\ArchitecturalGarden\build_scene.py'
& 'D:\SteamLibrary\steamapps\common\Blender\blender.exe' --background --factory-startup --python-exit-code 1 --python 'Design\ArchitecturalGarden\verify_exports.py'
python 'Design\ArchitecturalGarden\make_previews.py'
```

Preview composition uses Pillow and the locally installed MiSans and Consolas
fonts. The font binaries are not bundled in the assets.

`build_scene.py -- --draft` renders a faster draft.
`build_scene.py -- --assets-only` rebuilds the master and exports without
rerendering; use it only when geometry, camera and materials are unchanged.

## Review boundary

Stop at this visual study. User review of the cabinet shape, garden composition
and architectural language comes before any interactive UI or plugin integration.
