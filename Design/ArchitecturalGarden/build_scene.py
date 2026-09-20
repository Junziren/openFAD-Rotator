"""Authored Blender geometry, pose checks, GLB export, and rendered evidence."""

import argparse
import itertools
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


ROOT = Path(__file__).resolve().parent
RENDERS = ROOT / "renders"
EXPORTS = ROOT / "exports"
SQRT_HALF = math.sqrt(0.5)
MATERIALS = {}
GROUPS = {}
MOVERS = []
ASSETS = []
SPEAKER_PARTS = {}


def material(name, hex_color, roughness=0.65, metallic=0.0):
    color = tuple(int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    color = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in color)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Metallic"].default_value = metallic
    MATERIALS[name] = mat
    return mat


def group(name, pos=(0, 0, 0), parent=None, control=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.18
    obj.parent = parent
    obj.location = pos
    if control:
        obj["control_id"] = control
        obj["normalized_min"] = 0.0
        obj["normalized_max"] = 1.0
        obj["purpose"] = "visual-study-only; no plugin binding"
        GROUPS[control] = obj
    ASSETS.append(obj)
    return obj


def mesh(name, vertices, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(MATERIALS[mat])
    ASSETS.append(obj)
    return obj


def finish_primitive(obj, name, mat, parent, bevel=0):
    obj.name = name
    obj.parent = parent
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(MATERIALS[mat])
    if bevel:
        mod = obj.modifiers.new("Small manufactured edge", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.affect = "EDGES"
        obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    ASSETS.append(obj)
    return obj


def box(name, pos, size, mat="Chalk", parent=None, bevel=0.018):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.scale = size
    return finish_primitive(obj, name, mat, parent, bevel)


def cylinder(name, pos, radius, depth, mat="Chalk", parent=None, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    return finish_primitive(bpy.context.object, name, mat, parent)


def beam(name, start, end, radius, mat, parent=None, vertices=12):
    start, end = Vector(start), Vector(end)
    obj = cylinder(name, (start + end) * 0.5, radius, (end - start).length, mat, parent, vertices)
    obj.rotation_euler = (end - start).to_track_quat("Z", "Y").to_euler()
    return obj


def ring(name, pos, outer, inner, depth, mat, parent=None, segments=40):
    vs, fs = [], []
    for z, r in ((-depth / 2, outer), (depth / 2, outer), (-depth / 2, inner), (depth / 2, inner)):
        vs.extend((pos[0] + r * math.cos(i * math.tau / segments),
                   pos[1] + r * math.sin(i * math.tau / segments), pos[2] + z)
                  for i in range(segments))
    for i in range(segments):
        j = (i + 1) % segments
        for a, b in ((0, segments), (segments, segments * 3),
                     (segments * 3, segments * 2), (segments * 2, 0)):
            fs.append((a + i, a + j, b + j, b + i))
    return mesh(name, vs, fs, mat, parent)


def prism(name, polygon, z0, z1, mat, parent=None):
    n = len(polygon)
    vs = [(x, y, z) for z in (z0, z1) for x, y in polygon]
    fs = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    fs += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh(name, vs, fs, mat, parent)


def arch(name, width, opening, spring, depth, pos, mat, parent=None, segments=16):
    # Closed extruded arch band with actual open space beneath the intrados.
    outer, inner = width / 2, opening / 2
    path = [(-outer, 0), (-outer, spring)]
    path += [(outer * math.cos(math.pi - i * math.pi / segments),
              spring + outer * math.sin(math.pi - i * math.pi / segments))
             for i in range(1, segments + 1)]
    path += [(outer, 0), (inner, 0), (inner, spring)]
    path += [(inner * math.cos(i * math.pi / segments),
              spring + inner * math.sin(i * math.pi / segments))
             for i in range(1, segments + 1)]
    path += [(-inner, 0)]
    n = len(path)
    vs = [(x + pos[0], y + pos[1], z + pos[2]) for y in (-depth / 2, depth / 2) for x, z in path]
    fs = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    fs += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh(name, vs, fs, mat, parent)


def radial_shell(name, profiles, thickness, mat, parent=None, segments=40):
    vs, fs = [], []
    count = len(profiles)
    for inner in (False, True):
        for z, r in profiles:
            rr = max(0.01, r - thickness) if inner else r
            vs += [(rr * math.cos(i * math.tau / segments),
                    rr * math.sin(i * math.tau / segments), z) for i in range(segments)]
    for side in (0, count * segments):
        for row in range(count - 1):
            for i in range(segments):
                a, b = side + row * segments + i, side + row * segments + (i + 1) % segments
                fs.append((a, b, b + segments, a + segments))
    for row in (0, count - 1):
        for i in range(segments):
            a, b = row * segments + i, row * segments + (i + 1) % segments
            fs.append((a, b, b + count * segments, a + count * segments))
    return mesh(name, vs, fs, mat, parent)


def horn(name, direction, parent):
    points = [(0.015, 0.0, 0.00, 0.065), (0.11, 0.0, 0.15, 0.073),
              (0.25, 0.0, 0.21, 0.090), (0.43, 0.0, 0.21, 0.140),
              (0.69, 0.0, 0.21, 0.245)]
    segments, vs, fs = 14, [], []
    centers = [Vector(p[:3]) for p in points]
    for inner in (False, True):
        for k, (_, _, _, radius) in enumerate(points):
            tangent = (centers[min(k + 1, len(points) - 1)] - centers[max(k - 1, 0)]).normalized()
            across = Vector((0, 1, 0))
            upright = tangent.cross(across).normalized()
            r = radius - 0.021 if inner else radius
            for i in range(segments):
                angle = i * math.tau / segments
                v = centers[k] + r * (math.cos(angle) * across + math.sin(angle) * upright)
                vs.append((direction * v.x, direction * v.y, v.z))
    length = len(points) * segments
    for offset in (0, length):
        for k in range(len(points) - 1):
            for i in range(segments):
                a = offset + k * segments + i
                b = offset + k * segments + (i + 1) % segments
                fs.append((a, b, b + segments, a + segments))
    for k in (0, len(points) - 1):
        for i in range(segments):
            a, b = k * segments + i, k * segments + (i + 1) % segments
            fs.append((a, b, b + length, a + length))
    return mesh(name, vs, fs, "Graphite", parent)


def drum_shell(parent):
    count, radius, inner = 30, 0.66, 0.61
    angles = [i * 1.5 * math.pi / count for i in range(count + 1)]
    n = len(angles)
    vs = [(r * math.cos(a), r * math.sin(a), z)
          for z, r in ((0, radius), (0.76, radius), (0, inner), (0.76, inner))
          for a in angles]
    fs = []
    for i in range(count):
        for a, b in ((0, n), (n, 3 * n), (3 * n, 2 * n), (2 * n, 0)):
            fs.append((a + i, a + i + 1, b + i + 1, b + i))
    fs += [(0, n, 3 * n, 2 * n), (n - 1, 2 * n - 1, 4 * n - 1, 3 * n - 1)]
    return mesh("Drum.closed_cutaway_shell", vs, fs, "Mineral", parent)


def world_xy(u, v, z=0):
    return ((u - v) * SQRT_HALF, (u + v) * SQRT_HALF, z)


def moving(obj, control, axis, low, high, prop="location"):
    obj["control_id"] = control
    obj["transform_property"] = prop
    obj["transform_axis_blender"] = "XYZ"[axis]
    obj["low"] = low
    obj["high"] = high
    MOVERS.append((obj, control, axis, low, high, prop))
    return obj


def pose(values, keyframe=None):
    for obj, control, axis, low, high, prop in MOVERS:
        getattr(obj, prop)[axis] = low + (high - low) * values[control]
        if keyframe is not None:
            obj.keyframe_insert(data_path=prop, index=axis, frame=keyframe, group=control)
    bpy.context.view_layer.update()


def make_speaker(parent):
    root = group("Leslie.assembly", parent=parent)
    root["asset_id"] = "original-cutaway-rotary-cabinet"
    root["reference"] = "Leslie mechanism; original exterior; not a measured model"
    for x in (-0.82, 0.82):
        for y in (-0.74, 0.74):
            box("Cabinet.foot", (x, y, 0.10), (0.22, 0.22, 0.20), "Graphite", root)
    box("Cabinet.plinth", (0, 0, 0.23), (2.10, 1.98, 0.16), "Graphite", root)
    box("Cabinet.floor", (0, 0, 0.34), (2.04, 1.92, 0.08), "Porcelain", root)
    box("Cabinet.back", (0, 0.92, 1.66), (2.04, 0.12, 2.64), "Chalk", root)
    box("Cabinet.left", (-0.96, 0.05, 1.66), (0.12, 1.62, 2.64), "Porcelain", root)
    box("Cabinet.right_rear", (0.96, 0.63, 1.66), (0.12, 0.46, 2.64), "Chalk", root)
    box("Cabinet.roof_cutback", (0, 0.48, 2.98), (2.08, 1.00, 0.12), "Porcelain", root)
    box("Cabinet.rear_roof_inlay", (0, 0.66, 3.05), (1.72, 0.38, 0.025), "Mineral", root, 0.005)
    box("Cabinet.front_left_stile", (-0.96, -0.86, 1.66), (0.12, 0.20, 2.64), "Chalk", root)
    box("Cabinet.front_lower_rail", (0, -0.89, 0.42), (2.04, 0.10, 0.12), "Porcelain", root)
    box("Cabinet.rear_technical_strip", (-0.73, 0.847, 1.71), (0.12, 0.035, 2.24), "Graphite", root)
    for i in range(8):
        box("Cabinet.side_louvre", (1.023, 0.62, 0.73 + i * 0.09), (0.018, 0.32, 0.037), "Graphite", root, 0.003)
    box("Cabinet.badge", (-0.47, -0.952, 0.41), (0.47, 0.022, 0.055), "Mineral", root, 0.003)
    for i in range(4):
        box("Cabinet.badge_bar", (-0.62 + i * 0.06, -0.966, 0.41), (0.022, 0.012, 0.030), "Porcelain", root, 0)

    # The baffle stays fixed; its center is an aperture, not a solid plate.
    for x in (-0.80, 0.80):
        box("Woofer.baffle_side", (x, 0, 1.50), (0.30, 1.78, 0.11), "Chalk", root)
    for y in (-0.76, 0.76):
        box("Woofer.baffle_edge", (0, y, 1.50), (1.30, 0.26, 0.11), "Chalk", root)
    woofer = group("Woofer.fixed_driver", parent=root)
    radial_shell("Woofer.cone", [(1.81, 0.19), (1.75, 0.28), (1.61, 0.47), (1.52, 0.59)], 0.025, "Graphite", woofer)
    ring("Woofer.rim", (0, 0, 1.515), 0.64, 0.57, 0.09, "Graphite", woofer)
    cylinder("Woofer.fixed_magnet", (0, 0, 1.88), 0.21, 0.18, "Aluminium", woofer)
    cylinder("Woofer.magnet_cap", (0, 0, 1.98), 0.15, 0.025, "Graphite", woofer)
    for i in range(8):
        a = math.tau * i / 8
        beam("Woofer.basket_rib", (0.22 * math.cos(a), 0.22 * math.sin(a), 1.86),
             (0.59 * math.cos(a), 0.59 * math.sin(a), 1.56), 0.025, "Aluminium", woofer)

    cylinder("Horn.fixed_compression_driver", (0, 0, 2.105), 0.23, 0.15, "Graphite", root)
    box("Horn.fixed_rear_support", (0, 0.53, 2.075), (0.16, 0.71, 0.07), "Aluminium", root)
    ring("Horn.fixed_bearing", (0, 0, 2.205), 0.13, 0.09, 0.055, "Aluminium", root)
    horn_root = group("Horn.pivot_Z", (0, 0, 2.245), root)
    horn_root["rotation_axis_blender"] = "Z"
    horn_root["rotation_axis_gltf"] = "Y"
    horn_root["role"] = "upper rotor; rotation-ready"
    horn_root.rotation_euler.z = math.radians(-22)
    horn("Horn.radiating_shell", 1, horn_root)
    horn("Horn.counterbalance_shell", -1, horn_root)
    ring("Horn.hub_band", (0, 0, 0.075), 0.115, 0.073, 0.07, "Mineral", horn_root, 24)
    SPEAKER_PARTS["horn"] = horn_root

    drum = group("Drum.pivot_Z", (0, 0, 0.405), root)
    drum["rotation_axis_blender"] = "Z"
    drum["rotation_axis_gltf"] = "Y"
    drum["role"] = "lower rotor; rotation-ready"
    drum_shell(drum)
    cylinder("Drum.bottom_disc", (0, 0, 0.027), 0.66, 0.054, "Mineral", drum)
    ring("Drum.top_lip", (0, 0, 0.76), 0.67, 0.44, 0.055, "Mineral", drum, 40)
    ring("Drum.bottom_accent", (0, 0, 0.085), 0.674, 0.642, 0.026, "Aluminium", drum, 40)
    # A finite-thickness sloped reflector remains inside the sweep cylinder.
    vs = [(-0.37, -0.34, 0.14), (0.37, -0.34, 0.14), (0.37, 0.34, 0.64), (-0.37, 0.34, 0.64)]
    vs += [(x, y, z - 0.045) for x, y, z in vs]
    mesh("Drum.internal_reflector", vs, [(0, 1, 2, 3), (7, 6, 5, 4),
         (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], "Porcelain", drum)
    SPEAKER_PARTS["drum"] = drum
    return root


def make_character(parent):
    root = group("01.Character_Tower", world_xy(-3.55, 0.70, 0.31), parent, "character")
    box("Character.foundation", (0, 0, 0.10), (1.78, 1.68, 0.20), "Stone", root)
    arch("Character.arcade", 1.27, 0.63, 0.39, 0.97, (0, 0.10, 0.20), "Coral", root)
    shaft = box("Character.telescopic_core", (0, 0.10, 0.83), (0.84, 0.78, 1), "Coral", root)
    moving(shaft, "character", 2, 0.32, 1.30, "scale")
    moving(shaft, "character", 2, 1.01, 1.50)
    top = group("Character.moving_crown", (0, 0.10, 1.18), root)
    moving(top, "character", 2, 1.18, 2.16)
    box("Character.cap", (0, 0, 0.06), (1.19, 1.11, 0.12), "Porcelain", top)
    for i in range(3):
        box("Character.crown_step", (0.12 * i, 0.12 * i, 0.16 + i * 0.10),
            (0.90 - i * 0.18, 0.83 - i * 0.18, 0.12), "Coral", top)
    for i in range(6):
        box("Character.approach_step", (-0.68, -0.76 + i * 0.16, 0.21 + i * 0.09),
            (0.31, 0.19, 0.12), "Porcelain", root, 0.008)
    return root


def make_motion(parent):
    root = group("02.Motion_Pavilion", world_xy(3.40, 2.10, 0.31), parent, "motion")
    cylinder("Motion.foundation", (0, 0, 0.10), 1.03, 0.20, "Stone", root, 40)
    ring("Motion.plinth_reveal", (0, 0, 0.225), 0.91, 0.71, 0.08, "Mineral", root)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        pole = cylinder("Motion.telescopic_column", (0.61 * math.cos(a), 0.61 * math.sin(a), 0.70), 0.075, 1, "Chalk", root, 8)
        moving(pole, "motion", 2, 0.72, 1.54, "scale")
        moving(pole, "motion", 2, 0.60, 1.01)
    roof = group("Motion.moving_ring", (0, 0, 1.1), root)
    moving(roof, "motion", 2, 0.98, 1.80)
    ring("Motion.ring_roof", (0, 0, 0.075), 1.01, 0.55, 0.15, "Mineral", roof)
    ring("Motion.roof_lip", (0, 0, 0.18), 1.025, 0.91, 0.06, "Porcelain", roof)
    for i in range(3):
        a = i * math.tau / 3
        beam("Motion.radial_tie", (0, 0, 0.08), (0.66 * math.cos(a), 0.66 * math.sin(a), 0.08),
             0.035, "Porcelain", roof)
    cylinder("Motion.center_cap", (0, 0, 0.12), 0.17, 0.16, "Porcelain", roof, 12)
    box("Motion.index", (0.80, 0, 0.24), (0.17, 0.07, 0.06), "Coral", roof, 0.003)
    return root


def make_space(parent):
    root = group("03.Space_Bridge", world_xy(-2.55, -2.70, 0.31), parent, "space")
    root.rotation_euler.z = math.pi / 4
    box("Space.fixed_footprint", (0, 0, 0.07), (3.06, 1.07, 0.14), "Stone", root)
    for sign in (-1, 1):
        end = group("Space.moving_abutment_" + str(sign), (sign * 0.65, 0, 0.14), root)
        moving(end, "space", 0, sign * 0.57, sign * 1.06)
        arch("Space.arch", 0.88, 0.53, 0.31, 0.67, (0, 0, 0), "BlueGreen", end)
        box("Space.end_deck", (0, 0, 0.80), (1.01, 0.83, 0.14), "Porcelain", end)
        box("Space.end_marker", (0, 0.29, 0.90), (0.79, 0.07, 0.06), "BlueGreen", end, 0.004)
    span = box("Space.telescopic_span", (0, 0, 0.94), (1, 0.62, 0.10), "BlueGreen", root, 0.01)
    moving(span, "space", 0, 0.50, 1.48, "scale")
    for i in range(3):
        box("Space.approach_step", (0, -0.70 + i * 0.14, 0.08 + i * 0.065),
            (0.60, 0.15, 0.10), "Chalk", root, 0.008)
    return root


def make_dream(parent):
    root = group("04.Dream_Terraces", world_xy(2.70, -2.85, 0.31), parent, "dream")
    box("Dream.foundation", (0, 0, 0.09), (1.70, 1.70, 0.18), "Stone", root)
    core = box("Dream.telescopic_spine", (0.20, 0.20, 0.80), (0.36, 0.36, 1), "Chalk", root)
    moving(core, "dream", 2, 0.68, 1.40, "scale")
    moving(core, "dream", 2, 0.53, 0.89)
    for i in range(4):
        terrace = group("Dream.moving_terrace_%02d" % i, (-0.16 + i * 0.11, -0.16 + i * 0.11, 0), root)
        moving(terrace, "dream", 2, 0.37 + i * 0.18, 0.37 + i * 0.42)
        size = 1.50 - i * 0.17
        box("Dream.terrace_slab", (0, 0, 0), (size, size, 0.12), "Butter", terrace, 0.01)
        box("Dream.terrace_top", (0, 0, 0.068), (size - 0.12, size - 0.12, 0.018), "Porcelain", terrace, 0.005)
        if i == 3:
            box("Dream.parapet", (size / 2 - 0.055, 0, 0.18), (0.075, size, 0.24), "Butter", terrace, 0.008)
            box("Dream.parapet_return", (0, size / 2 - 0.055, 0.18), (size, 0.075, 0.24), "Butter", terrace, 0.008)
    return root


def make_landscape():
    root = group("Garden.asset")
    root["asset_version"] = "1.0-study"
    outline = [(-5.60, -2.8), (-4.20, -4.20), (3.70, -4.20), (5.60, -2.35),
               (5.60, 1.85), (3.85, 3.25), (-3.85, 3.25), (-5.60, 1.85)]
    outline = [world_xy(x, y)[:2] for x, y in outline]
    prism("Landscape.lower_raft", outline, -0.12, 0.09, "Stone", root)
    prism("Landscape.upper_raft", [(x * 0.985, y * 0.985) for x, y in outline], 0.09, 0.31, "Chalk", root)
    plaza = group("Landscape.central_plaza", world_xy(0, 0.52, 0.31), root)
    cylinder("Landscape.speaker_dais", (0, 0, 0.075), 1.58, 0.15, "Porcelain", plaza, 48)
    ring("Landscape.dais_inlay", (0, 0, 0.155), 1.52, 1.47, 0.015, "BlueGreen", plaza, 64)
    box("Landscape.central_stair_1", world_xy(0, -1.00, 0.35), (0.66, 0.66, 0.08), "Porcelain", root)
    for side in (-1, 1):
        for i in range(5):
            pos = world_xy(side * (1.70 + i * 0.36), 0.58, 0.326)
            tile = box("Landscape.path_tile", pos, (0.30, 0.54, 0.024), "Stone", root, 0.005)
            tile.rotation_euler.z = math.pi / 4
        planter = group("Landscape.sunken_bed_" + str(side),
                        world_xy(-3.35, 2.26, 0.31) if side < 0 else world_xy(4.85, 1.25, 0.31), root)
        planter.rotation_euler.z = math.pi / 4 if side < 0 else -math.pi / 4
        box("Landscape.bed", (0, 0, 0.075), (2.00, 0.49, 0.15), "Stone", planter)
        box("Landscape.moss_plane", (0, 0, 0.156), (1.84, 0.35, 0.018), "Moss", planter, 0)
        for i in range(6):
            box("Landscape.sculpted_hedge", (-0.72 + i * 0.285, 0, 0.23 + (i % 2) * 0.035),
                (0.23, 0.23, 0.14 + (i % 2) * 0.07), "Mineral", planter, 0.015)
    # A low rear colonnade establishes a garden without becoming a fifth control.
    rear = group("Landscape.rear_colonnade", world_xy(0, 2.55, 0.31), root)
    rear.rotation_euler.z = math.pi / 4
    for x in (-1.95, -1.30, 1.30, 1.95):
        arch("Landscape.rear_arch", 0.59, 0.40, 0.42, 0.18, (x, 0, 0), "Porcelain", rear)
    for side in (-1, 1):
        box("Landscape.rear_lintel", (side * 1.63, 0, 0.76), (1.41, 0.28, 0.10), "Porcelain", rear)
    return root, plaza


def setup():
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    colors = {"Chalk": "DCE2DF", "Porcelain": "F3F1E9", "Stone": "BFCFCB",
              "Graphite": "283C41", "Mineral": "709D90", "Coral": "C86D64",
              "BlueGreen": "5B949F", "Butter": "DFBF68", "Aluminium": "9EA9A7", "Moss": "617D6A"}
    for name, color in colors.items():
        material(name, color, 0.48 if name in ("Mineral", "Graphite") else 0.72,
                 0.38 if name == "Aluminium" else 0)
    scene = bpy.context.scene
    scene.name = "Acoustic Garden - Macro Study"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.83, 0.81, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for device in prefs.devices:
            device.use = device.type == "OPTIX"
        scene.cycles.device = "GPU"
    except Exception as exc:
        print("GPU unavailable; CPU fallback:", exc)
    ground = box("STUDIO.shadow_floor", (0, 0, -0.22), (200, 200, 0.16), "Chalk", bevel=0)
    ASSETS.remove(ground)
    for name, loc, energy, size in [
        ("STUDIO.key", (-3, -6, 10), 1800, 4.0),
        ("STUDIO.fill", (7, -1, 7), 750, 5.0),
        ("STUDIO.rim", (0, 7, 9), 1250, 4.0),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, 0.5)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return scene


def camera(name, target, scale, distance=18):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.clip_end = 300
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(target) + Vector((1, -1, 1)) * distance
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def render(scene, cam, filename, width, height):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(RENDERS / filename)
    print("RENDER", filename, flush=True)
    bpy.ops.render.render(write_still=True)


def descendants(root):
    return [root] + list(root.children_recursive)


def bounds(root):
    bpy.context.view_layer.update()
    return [obj.matrix_world @ Vector(v) for obj in descendants(root)
            if obj.type == "MESH" for v in obj.bound_box]


def projected_rect(root, cam):
    # Mesh vertices avoid the oversized 45-degree box around circular pavilions.
    pts = [world_to_camera_view(bpy.context.scene, cam, obj.matrix_world @ v.co)
           for obj in descendants(root) if obj.type == "MESH" for v in obj.data.vertices]
    return [min(p.x for p in pts), min(p.y for p in pts), max(p.x for p in pts), max(p.y for p in pts)]


def validate(scene, cam, speaker):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1040
    checks = {"blender": bpy.app.version_string, "macro_combinations_checked": 0,
              "screen_bounds_failures": [], "control_overlap_pairs": [],
              "non_manifold_meshes": [], "non_positive_volumes": [], "labels": {}, "controls": {}}
    controls = list(GROUPS)
    unions = {key: [float("inf"), float("inf"), -float("inf"), -float("inf")]
              for key in controls}
    for values in itertools.product((0, 0.5, 1), repeat=4):
        state = dict(zip(controls, values))
        pose(state)
        rects = {key: projected_rect(root, cam) for key, root in GROUPS.items()}
        rects["speaker"] = projected_rect(speaker, cam)
        for key in controls:
            r, u = rects[key], unions[key]
            unions[key] = [min(u[0], r[0]), min(u[1], r[1]), max(u[2], r[2]), max(u[3], r[3])]
        for key, rect in rects.items():
            if rect[0] < 0.035 or rect[1] < 0.06 or rect[2] > 0.965 or rect[3] > 0.94:
                checks["screen_bounds_failures"].append({"state": state, "object": key, "rect": rect})
        for a, b in itertools.combinations(rects, 2):
            ra, rb = rects[a], rects[b]
            overlap_x = min(ra[2], rb[2]) - max(ra[0], rb[0])
            overlap_y = min(ra[3], rb[3]) - max(ra[1], rb[1])
            if overlap_x > 0.005 and overlap_y > 0.005:
                checks["control_overlap_pairs"].append({"state": state, "a": a, "b": b})
        checks["macro_combinations_checked"] += 1
    pose({k: 0.5 for k in controls})
    for obj in ASSETS:
        if obj.type != "MESH":
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bad = sum(not edge.is_manifold for edge in bm.edges)
        if bad:
            checks["non_manifold_meshes"].append({"object": obj.name, "edges": bad})
        if bm.calc_volume(signed=True) <= 0:
            checks["non_positive_volumes"].append(obj.name)
        bm.free()
    for key, root in GROUPS.items():
        point = world_to_camera_view(scene, cam, root.matrix_world.translation)
        checks["labels"][key] = {"anchor": [point.x, 1 - point.y], "rect": unions[key]}
        checks["controls"][key] = {"root": root.name, "parts": [m[0].name for m in MOVERS if m[1] == key]}
    garden_rect = projected_rect(bpy.data.objects["Garden.asset"], cam)
    checks["floor_bottom"] = 1 - garden_rect[1]
    checks["viewports"] = {}
    for width, height in ((1100, 760), (820, 600)):
        stage_height = height - 136
        sx = 13.85 / 14.60
        sy = (13.85 * 1040 / 1600) / (14.60 * stage_height / width)
        transformed = {
            key: [0.5 + (r[0] - 0.5) * sx, 0.5 + (r[1] - 0.5) * sy,
                  0.5 + (r[2] - 0.5) * sx, 0.5 + (r[3] - 0.5) * sy]
            for key, r in unions.items()
        }
        for rect in transformed.values():
            assert min(rect[:2]) > 0.025 and max(rect[2:]) < 0.975
        checks["viewports"][str(width)] = {
            "rects": transformed,
            "floor_bottom": 0.5 + (checks["floor_bottom"] - 0.5) * sy,
            "camera_scale": 14.60, "stage_size": [width, stage_height],
        }
    horn_points = [SPEAKER_PARTS["horn"].matrix_world.inverted() @ p for p in bounds(SPEAKER_PARTS["horn"])]
    horn_radius = max(math.hypot(p.x, p.y) for p in horn_points)
    # Checking the enclosing sweep cylinder covers every angle, not just sampled poses.
    checks["clearance"] = {
        "horn_sweep_radius": horn_radius,
        "cabinet_minimum_inner_half_extent": 0.86,
        "horn_radial_clearance": 0.86 - horn_radius,
        "drum_sweep_radius": 0.674,
        "drum_radial_clearance": 0.86 - 0.674,
        "drum_top_to_fixed_baffle": 1.445 - (0.405 + 0.76 + 0.055 / 2),
        "horn_top_to_roof": 2.92 - (2.245 + 0.21 + 0.245),
    }
    assert checks["clearance"]["horn_radial_clearance"] > 0.015
    assert checks["clearance"]["horn_top_to_roof"] > 0.02
    assert not checks["non_manifold_meshes"], checks["non_manifold_meshes"]
    assert not checks["non_positive_volumes"], checks["non_positive_volumes"]
    assert not checks["screen_bounds_failures"], checks["screen_bounds_failures"][:3]
    assert not checks["control_overlap_pairs"], checks["control_overlap_pairs"][:3]
    (ROOT / "validation.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
    return checks


def export_asset(filename, objects, animations=False):
    # Keep the editable master granular; batch only temporary export copies.
    temp = bpy.data.collections.new("EXPORT_TEMP")
    bpy.context.scene.collection.children.link(temp)
    copies = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    animated = {entry[0] for entry in MOVERS}
    semantic_roots = set(GROUPS.values()) | set(SPEAKER_PARTS.values())
    semantic_roots.update(obj for obj in objects if obj.name in (
        "Garden.asset", "Leslie.assembly", "Woofer.fixed_driver", "Speaker.mount"))
    semantic_roots.update(animated)
    for obj in objects:
        duplicate = obj.copy()
        if obj.type == "MESH":
            duplicate.data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
            duplicate.modifiers.clear()
        temp.objects.link(duplicate)
        copies[obj] = duplicate
    for original, duplicate in copies.items():
        duplicate.parent = copies.get(original.parent)
        duplicate.matrix_world = original.matrix_world.copy()
    bpy.context.view_layer.update()
    batches = {}
    for original, duplicate in copies.items():
        if original.type != "MESH" or original in animated:
            continue
        ancestor = original.parent
        while ancestor and ancestor not in semantic_roots:
            ancestor = ancestor.parent
        parent_copy = copies.get(ancestor)
        if ancestor is None:
            continue
        transform = duplicate.matrix_world.copy()
        duplicate.parent = parent_copy
        duplicate.matrix_world = transform
        key = (ancestor, tuple(m.name for m in duplicate.data.materials))
        batches.setdefault(key, []).append(duplicate)
    for (ancestor, material_names), batch in batches.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in batch:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = batch[0]
        if len(batch) > 1:
            bpy.ops.object.join()
        batch[0].name = ancestor.name + ".Surface." + "_".join(material_names)
    export_objects = list(temp.objects)
    original_names = {}
    for original, duplicate in copies.items():
        if original.type == "EMPTY" or original in animated:
            original_names[original] = original.name
            original.name += ".SOURCE"
            duplicate.name = original_names[original]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = export_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(EXPORTS / filename), export_format="GLB", use_selection=True,
        export_apply=True, export_extras=True, export_animations=animations,
        export_animation_mode="SCENE", export_frame_range=True,
        export_anim_scene_split_object=False, export_current_frame=True,
        export_nla_strips_merged_animation_name="MacroStates_Low_Mid_High",
        export_cameras=False, export_lights=False, export_yup=True,
    )
    for obj in list(temp.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(temp)
    for original, name in original_names.items():
        original.name = name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", action="store_true")
    parser.add_argument("--assets-only", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    RENDERS.mkdir(parents=True, exist_ok=True)
    EXPORTS.mkdir(parents=True, exist_ok=True)
    scene = setup()
    garden, plaza = make_landscape()
    speaker_mount = group("Speaker.mount", world_xy(0, 0.52, 0.47), garden)
    speaker = make_speaker(speaker_mount)
    make_character(garden)
    make_motion(garden)
    make_space(garden)
    make_dream(garden)
    garden_cam = camera("CAMERA.Garden_Isometric", world_xy(0, -0.10, 0.65), 13.85)
    speaker_cam = camera("CAMERA.Cabinet_Detail", speaker_mount.location + Vector((0, 0, 1.52)), 4.60)
    scene.frame_start, scene.frame_end = 1, 101
    scene.render.fps = 25
    for frame, value, label in [(1, 0, "LOW / 0%"), (51, 0.5, "MID / 50%"), (101, 1, "HIGH / 100%")]:
        pose({key: value for key in GROUPS}, frame)
        scene.timeline_markers.new(label, frame=frame)
    scene.frame_set(51)
    checks = validate(scene, garden_cam, speaker)
    print("COMPOSITION CHECK", json.dumps({k: len(checks[k]) for k in ("screen_bounds_failures", "control_overlap_pairs", "non_manifold_meshes")}), flush=True)
    scene.camera = garden_cam
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
            area.spaces.active.shading.type = "MATERIAL"
    bpy.ops.object.select_all(action="DESELECT")
    garden.select_set(True)
    bpy.context.view_layer.objects.active = garden
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "AcousticGarden.blend"))
    if args.draft:
        scene.cycles.samples = 24
        render(scene, garden_cam, "garden-draft.png", 1280, 832)
        render(scene, speaker_cam, "speaker-draft.png", 900, 1050)
        return
    export_asset("acoustic-garden.glb", descendants(garden), animations=True)
    # The standalone speaker is centered at its own base for direct reuse.
    original_pos = speaker_mount.location.copy()
    speaker_mount.location = (0, 0, 0)
    export_asset("rotary-speaker.glb", descendants(speaker_mount))
    speaker_mount.location = original_pos
    if args.assets_only:
        scene.frame_set(51)
        scene.camera = garden_cam
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "AcousticGarden.blend"))
        return
    for frame, state in [(1, "low"), (51, "mid"), (101, "high")]:
        scene.frame_set(frame)
        render(scene, garden_cam, "garden-" + state + ".png", 1600, 1040)
    scene.frame_set(51)
    garden_cam.data.ortho_scale = 14.60
    for width, height in ((1100, 760), (820, 600)):
        render(scene, garden_cam, "viewport-stage-%d.png" % width, width, height - 136)
    garden_cam.data.ortho_scale = 13.85
    # Hide landscape and control architecture, leaving a clean cabinet study.
    hidden = [obj for obj in ASSETS if obj.type == "MESH" and obj not in descendants(speaker)]
    for obj in hidden:
        obj.hide_render = True
    delta = Vector((0, 0, -0.14)) - speaker_mount.location
    speaker_mount.location += delta
    speaker_cam.location += delta
    render(scene, speaker_cam, "speaker-detail.png", 1200, 1400)
    speaker_mount.location -= delta
    speaker_cam.location -= delta
    for obj in hidden:
        obj.hide_render = False
    scene.camera = garden_cam
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1040
    scene.render.filepath = str(RENDERS / "garden-mid.png")
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "AcousticGarden.blend"))
    print("ASSET STUDY COMPLETE", flush=True)


if __name__ == "__main__":
    main()
