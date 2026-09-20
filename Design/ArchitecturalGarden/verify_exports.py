"""Round-trip the actual GLBs, not only the Blender master."""

import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
NAMES = {
    "character": "01.Character_Tower",
    "motion": "02.Motion_Pavilion",
    "space": "03.Space_Bridge",
    "dream": "04.Dream_Terraces",
    "speaker": "Leslie.assembly",
}


def world_bounds(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    points = []
    for child in [obj] + list(obj.children_recursive):
        if child.type != "MESH":
            continue
        evaluated = child.evaluated_get(deps)
        points.extend(evaluated.matrix_world @ v.co for v in evaluated.data.vertices)
    return [min(v[i] for v in points) for i in range(3)] + [max(v[i] for v in points) for i in range(3)]


def snapshots():
    result = {}
    for frame in (1, 51, 101):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        result[str(frame)] = {key: world_bounds(bpy.data.objects[name]) for key, name in NAMES.items()}
    return result


def main():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / "AcousticGarden.blend"))
    source = snapshots()
    pivot_positions = {name: list(bpy.data.objects[name].matrix_world.translation)
                       for name in ("Horn.pivot_Z", "Drum.pivot_Z")}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 25
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "exports" / "acoustic-garden.glb"))
    exported = snapshots()
    error = max(abs(a - b) for frame in source for key in source[frame]
                for a, b in zip(source[frame][key], exported[frame][key]))
    if error >= 0.002:
        for frame in source:
            for key in source[frame]:
                delta = max(abs(a - b) for a, b in zip(source[frame][key], exported[frame][key]))
                if delta >= 0.002:
                    print("ROUNDTRIP DIFFERENCE", frame, key, delta,
                          source[frame][key], exported[frame][key], flush=True)
    assert error < 0.002, ("GLB animation or transforms changed", error)
    for name, expected in pivot_positions.items():
        actual = bpy.data.objects[name].matrix_world.translation
        assert (actual - Vector(expected)).length < 0.0001
    for key, name in NAMES.items():
        if key != "speaker":
            assert bpy.data.objects[name]["control_id"] == key
    report = {"animation_frames_checked": [1, 51, 101], "maximum_bounds_error": error,
              "pivot_origins_preserved": True, "control_ids_preserved": True,
              "source_bounds": source, "roundtrip_bounds": exported}
    # Render the imported file through the same studio setup as a visual check.
    spec = importlib.util.spec_from_file_location("garden_builder", ROOT / "build_scene.py")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    bpy.ops.wm.read_factory_settings(use_empty=False)
    scene = builder.setup()
    scene.render.fps = 25
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "exports" / "acoustic-garden.glb"))
    scene.frame_set(51)
    cam = builder.camera("VERIFY.Camera", builder.world_xy(0, -0.10, 0.65), 13.85)
    builder.render(scene, cam, "glb-roundtrip.png", 1600, 1040)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "exports" / "rotary-speaker.glb"))
    assembly = bpy.data.objects["Leslie.assembly"]
    bb = world_bounds(assembly)
    assert abs(bb[2]) < 0.0001, ("Standalone cabinet is not grounded", bb)
    assert abs((bb[0] + bb[3]) / 2) < 0.03
    assert abs((bb[1] + bb[4]) / 2) < 0.03
    assert "Horn.pivot_Z" in bpy.data.objects and "Drum.pivot_Z" in bpy.data.objects
    report["standalone_cabinet_bounds"] = bb
    report["standalone_centered_and_grounded"] = True
    (ROOT / "export-validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("ROUNDTRIP VERIFIED", json.dumps({k: report[k] for k in (
        "maximum_bounds_error", "pivot_origins_preserved", "control_ids_preserved",
        "standalone_centered_and_grounded")}), flush=True)


if __name__ == "__main__":
    main()
