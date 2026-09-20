"""Compose review plates from actual Blender renders and audit GLB containers."""

import hashlib
import json
from pathlib import Path
import struct

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parent
RENDERS = ROOT / "renders"
PREVIEWS = ROOT / "previews"
INK = "#263D40"
MUTED = "#647774"
PAPER = "#EEF1EF"
LINE = "#BCCAC6"
ACCENTS = {"character": "#B65750", "motion": "#48796D", "space": "#387D8B", "dream": "#9B7426"}
NAMES = {
    "character": ("01", "\u6027\u683c", "CHARACTER"),
    "motion": ("02", "\u8fd0\u52a8", "MOTION"),
    "space": ("03", "\u7a7a\u95f4", "SPACE"),
    "dream": ("04", "\u68a6\u5883", "DREAM"),
}
FONT = Path("C:/Windows/Fonts/MiSans-Regular.otf")
MONO = Path("C:/Windows/Fonts/consola.ttf")
VALIDATION = json.loads((ROOT / "validation.json").read_text(encoding="utf-8"))


def font(size, mono=False):
    return ImageFont.truetype(str(MONO if mono else FONT), size)


def text(draw, xy, value, size=16, fill=INK, mono=False, anchor=None):
    draw.text(xy, value, font=font(size, mono), fill=fill, anchor=anchor)


def overlap(a, b, margin=0):
    return min(a[2], b[2]) - max(a[0], b[0]) > margin and min(a[3], b[3]) - max(a[1], b[1]) > margin


def fit_image(image, rect):
    left, top, right, bottom = rect
    factor = min((right - left) / image.width, (bottom - top) / image.height)
    size = (round(image.width * factor), round(image.height * factor))
    offset = (round((left + right - size[0]) / 2), round((top + bottom - size[1]) / 2))
    return image.resize(size, Image.Resampling.LANCZOS), offset


def scene_rect(rect, offset, size):
    x, y = offset
    w, h = size
    return (x + rect[0] * w, y + (1 - rect[3]) * h, x + rect[2] * w, y + (1 - rect[1]) * h)


def labels(draw, offset, size, small=False, viewport_width=None):
    w, h = size
    ox, oy = offset
    fsize, subtitle = (15, 10) if small else (21, 13)
    blockw, blockh = (100, 41) if small else (168, 53)
    if viewport_width:
        layout = VALIDATION["viewports"][str(viewport_width)]
        source_rects = layout["rects"]
        floor_bottom = layout["floor_bottom"]
    else:
        source_rects = {key: row["rect"] for key, row in VALIDATION["labels"].items()}
        floor_bottom = VALIDATION["floor_bottom"]
    all_rects = {key: scene_rect(rect, offset, size) for key, rect in source_rects.items()}
    placed = {}
    for key, (index, cn, en) in NAMES.items():
        rect = all_rects[key]
        if key == "character":
            x, y = round(rect[0] - blockw - 12), round(oy + h * 0.465 - blockh / 2)
        elif key == "motion":
            x, y = round(rect[2] + 14), round(oy + h * 0.35 - blockh / 2)
        else:
            x, y = round((rect[0] + rect[2] - blockw) / 2), round(oy + floor_bottom * h + 12)
        block = (x, y, x + blockw, y + blockh)
        for obj_key, obj_rect in all_rects.items():
            assert not overlap(block, obj_rect), (key, "label occludes", obj_key, block, obj_rect)
        for other in placed.values():
            assert not overlap(block, other)
        draw.line((x, y + 1, x + 17, y + 1), fill=ACCENTS[key], width=3)
        text(draw, (x + 24, y - 9), index + "  " + cn, fsize)
        text(draw, (x, y + (20 if small else 27)), en + "   50%", subtitle, MUTED, True)
        placed[key] = block
    return placed, all_rects


def overview():
    image = Image.open(RENDERS / "garden-mid.png").convert("RGB")
    draw = ImageDraw.Draw(image)
    text(draw, (47, 29), "openFAD Rotator", 28)
    text(draw, (1552, 39), "ACOUSTIC GARDEN / STUDY 01", 15, MUTED, True, "ra")
    labels(draw, (0, 0), image.size)
    text(draw, (47, 987), "BLENDER MODEL STUDY", 13, MUTED, True)
    text(draw, (1552, 987), "ORTHOGRAPHIC / MID POSE", 13, MUTED, True, "ra")
    image.save(PREVIEWS / "overview.png")


def viewport(width, height):
    header, footer = 66, 70
    image = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(image)
    fitted = Image.open(RENDERS / f"viewport-stage-{width}.png").convert("RGB")
    offset = (0, header)
    image.paste(fitted, offset)
    draw = ImageDraw.Draw(image)
    text(draw, (20, 14), "openFAD Rotator", 19)
    text(draw, (20, 41), "\u5de5\u5177\u680f\u9884\u7559\u533a", 11, MUTED)
    text(draw, (width - 20, 21), f"VIEWPORT STUDY / {width} x {height}", 11, MUTED, True, "ra")
    draw.line((0, header - 1, width, header - 1), fill=LINE, width=1)
    draw.line((0, height - footer, width, height - footer), fill=LINE, width=1)
    text(draw, (20, height - 54), "\u5e38\u7528\u63a7\u4ef6\u9884\u7559\u533a", 12, MUTED)
    text(draw, (20, height - 29), "SPEED  /  MIX  /  OUTPUT  /  BYPASS  /  FREEZE", 11, MUTED, True)
    placed, objects = labels(draw, offset, fitted.size, small=True, viewport_width=width)
    for key, rect in placed.items():
        assert rect[0] >= 10 and rect[2] <= width - 10, ("label outside viewport", key, rect)
        assert rect[1] >= header and rect[3] <= height - footer
    for key, rect in objects.items():
        assert rect[2] - rect[0] >= 44 and rect[3] - rect[1] >= 44, ("small hit region", key)
    image.save(PREVIEWS / f"viewport-{width}x{height}.png")
    return {"size": [width, height], "reserved_top": header, "reserved_bottom": footer,
            "label_rectangles": placed, "object_rectangles": objects,
            "label_overlap": False, "minimum_control_bounds_at_least_44px": True}


def comparison():
    width, height = 2040, 662
    image = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(image)
    text(draw, (36, 23), "\u5efa\u7b51\u5f62\u53d8 / Macro states", 28)
    text(draw, (width - 36, 34), "SAME CAMERA / SAME LIGHT / FOUR MACROS", 13, MUTED, True, "ra")
    states = [("low", "LOW", "0%"), ("mid", "MID", "50%"), ("high", "HIGH", "100%")]
    for i, (state, title, value) in enumerate(states):
        left = 26 + i * 672
        draw.line((left + 10, 90, left + 58, 90), fill=INK, width=3)
        text(draw, (left + 70, 76), title, 22)
        text(draw, (left + 637, 82), value, 20, MUTED, True, "ra")
        render = Image.open(RENDERS / f"garden-{state}.png").convert("RGB")
        fitted = render.resize((644, 419), Image.Resampling.LANCZOS)
        image.paste(fitted, (left, 122))
        text(draw, (left + 10, 564), "\u6027\u683c  /  \u8fd0\u52a8  /  \u7a7a\u95f4  /  \u68a6\u5883", 16)
        text(draw, (left + 10, 593), "ALL FOUR MACROS AT " + value, 13, MUTED, True)
    image.save(PREVIEWS / "macro-states.png")


def glb_report(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data)
    n, chunk = struct.unpack_from("<II", data, 12)
    assert chunk == 0x4E4F534A
    doc = json.loads(data[20:20 + n])
    assert not doc.get("images") and not doc.get("textures")
    assert all("uri" not in buffer for buffer in doc.get("buffers", []))
    primitives = [p for mesh in doc.get("meshes", []) for p in mesh["primitives"]]
    triangles = 0
    for p in primitives:
        assert p.get("mode", 4) == 4
        triangles += doc["accessors"][p["indices"]]["count"] // 3
    names = {node.get("name") for node in doc.get("nodes", [])}
    assert "Horn.pivot_Z" in names and "Drum.pivot_Z" in names
    controls = sorted({node.get("extras", {}).get("control_id") for node in doc.get("nodes", [])
                       if node.get("extras", {}).get("control_id")})
    if path.name == "acoustic-garden.glb":
        assert controls == ["character", "dream", "motion", "space"]
        assert len(doc.get("animations", [])) == 1
        assert len(doc["animations"][0]["channels"]) >= 15
        assert len(primitives) <= 60 and triangles <= 60000
    return {"file": path.name, "bytes": len(data), "triangles": triangles,
            "mesh_primitives": len(primitives), "materials": len(doc.get("materials", [])),
            "animations": len(doc.get("animations", [])), "macro_ids": controls,
            "no_external_resources": True, "sha256": hashlib.sha256(data).hexdigest()}


def main():
    PREVIEWS.mkdir(exist_ok=True)
    overview()
    comparison()
    viewports = [viewport(1100, 760), viewport(820, 600)]
    source = Image.open(RENDERS / "garden-mid.png").convert("RGB")
    states = [Image.open(RENDERS / f"garden-{s}.png").convert("RGB") for s in ("low", "mid", "high")]
    image_stats = {}
    for state, image in zip(("low", "mid", "high"), states):
        stddev = ImageStat.Stat(image).stddev
        assert min(stddev) > 15
        image_stats[state] = {"size": list(image.size), "channel_stddev": stddev}
    assert len({hashlib.sha256(image.tobytes()).hexdigest() for image in states}) == 3
    exported = Image.open(RENDERS / "glb-roundtrip.png").convert("RGB")
    difference = ImageStat.Stat(ImageChops.difference(source, exported)).mean
    assert max(difference) < 5, ("GLB visual changed", difference)
    report = {"viewports": viewports, "renders": image_stats, "three_distinct_poses": True,
              "glb_render_mean_absolute_channel_difference": difference,
              "glb_assets": [glb_report(path) for path in sorted((ROOT / "exports").glob("*.glb"))]}
    assert sum(row["bytes"] for row in report["glb_assets"]) < 4 * 1024 * 1024
    (ROOT / "preview-validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
