#!/usr/bin/env python3
"""Build FXjutsu's compositing graphs from the two tested Lightricks LTX-2.5 graphs.

  subject  Alpha-Gen matte pass (V2V IC-LoRA) + Union Control depth restyle (two-stage); the restyled subject is
           pasted over the untouched original shot.
  world    Alpha-Gen matte pass + Clean-Plate pass + Union Control restyle of that empty plate; the original subject
           is pasted over the restyled world (restyling the empty plate keeps a restyled copy of the subject from
           showing around the real one).
  ghost    Alpha-Gen matte pass + Clean-Plate pass: the clean plate fills the hole the subject leaves, and the subject
           is laid back on top as a translucent, glowing ghost.

The composite runs at the source clip's own resolution (capped at 1920 px), so every pixel outside the matte
comes straight from the original footage. Only core ComfyUI nodes are added, so the graphs run on the same
Comfy API build (comfy-build.yaml) as the single-pass presets.

Usage: python3 scripts/build_composite_workflows.py   -> workflows/ltx25_composite_{subject,world,ghost}.api.json
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WF = ROOT / "workflows"

CAP_SECONDS = 5.0  # Video Slice before decoding: long uploads never get decoded in full
CAP_FRAMES = 121  # 8k+1 frames; Alpha-Gen is validated up to 145
MAX_SIDE = 1920  # composite resolution cap (4K phone clips are downscaled, smaller clips stay untouched)

SHARED = {"5001", "2004"}  # LoadVideo (the clip) and LoadImage (first frame) are shared by all passes
LOADERS = {"VAELoader", "UNETLoader", "CLIPLoader", "LatentUpscaleModelLoader", "LoadVideoDepthAnythingModel"}
DROP = {
    "4852",  # SaveVideo
    "5544",  # PreviewAny (prompt preview)
    "5518:4849",  # CreateVideo
    "5518:4848",  # LTXVAudioVAEDecode: the composite keeps the original sound
}
VIDEO_COMPONENTS = {"v2v": "5548:9006", "union": "5548:5000"}
CLEAN_PLATE = {  # same wording as the Vanish preset (lib/presets.ts)
    "lora": "ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors",
    "prompt": "An empty clean plate of the exact same location: identical background, environment, structures, camera "
              "motion and lighting as the source video, with no people, no humans, no figures, no animals, no vehicles "
              "and no body parts anywhere in the frame.",
    "negative": "person, people, human, figure, limb, arm, hand, leg, body part, animal, vehicle, robot, character, shadow "
                "of a person, leftover people, leftover figures, ghosting, semi-transparent remnants, blurry, soft, "
                "distorted, inconsistent motion, jitter",
}


def load(name):
    return json.loads((WF / name).read_text())


def is_link(v):
    return isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)


def source(g):
    """Shared source: trim to 5 s before decoding, keep at most 121 frames, cap the long side at 1920 px."""
    g["src.slice"] = node("Video Slice", video=["5001", 0], start_time=0.0, duration=CAP_SECONDS, strict_duration=False)
    g["src.components"] = node("GetVideoComponents", video=["src.slice", 0])
    g["src.cap"] = node("ImageFromBatch", image=["src.components", 0], batch_index=0, length=CAP_FRAMES)
    g["src.size"] = node("GetImageSize", image=["src.cap", 0])
    g["src.fit"] = node("ComfyMathExpression", expression=f"min(1.0, {MAX_SIDE} / max(a, b))",
                        **{"values.a": ["src.size", 0], "values.b": ["src.size", 1]})
    g["src.frames"] = node("ResizeImageMaskNode", input=["src.cap", 0], resize_type="scale by multiplier",
                           scale_method="area", **{"resize_type.multiplier": ["src.fit", 0]})
    return {0: ["src.frames", 0], 1: ["src.components", 1], 2: ["src.components", 2]}


def add_pass(g, graph, kind, prefix, src):
    """Copy one Lightricks graph into g with prefixed ids; its GetVideoComponents is replaced by the shared source."""
    vc = VIDEO_COMPONENTS[kind]

    def rid(i):
        return i if i in SHARED else f"{prefix}.{i}"

    for nid, n in graph.items():
        if nid in DROP or nid == vc or (nid in SHARED and nid in g):
            continue
        n = copy.deepcopy(n)
        for k, v in n["inputs"].items():
            if is_link(v):
                n["inputs"][k] = list(src[v[1]]) if v[0] == vc else [rid(v[0]), v[1]]
        g[rid(nid)] = n


def dedupe_loaders(g):
    """Both passes load the same transformer, VAEs and text encoders: keep one loader of each."""
    seen, alias = {}, {}
    for nid in sorted(g):
        n = g[nid]
        if n["class_type"] in LOADERS and not any(is_link(v) for v in n["inputs"].values()):
            key = (n["class_type"], json.dumps(n["inputs"], sort_keys=True))
            if key in seen:
                alias[nid] = seen[key]
            else:
                seen[key] = nid
    for nid in alias:
        del g[nid]
    for n in g.values():
        for k, v in n["inputs"].items():
            if is_link(v) and v[0] in alias:
                n["inputs"][k] = [alias[v[0]], v[1]]


def node(cls, **inputs):
    return {"class_type": cls, "inputs": inputs}


def matte_pass(g, src):
    add_pass(g, load("ltx25_v2v.api.json"), "v2v", "matte", src)
    g["matte.5004:5606"]["inputs"].update(lora_name="ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors", strength_model=1.0)
    g["matte.5508"]["inputs"]["value"] = ""  # Alpha-Gen card: empty prompt
    g["matte.5509"]["inputs"]["value"] = ""
    g["matte.9002:3159"]["inputs"]["strength"] = 0  # no first-frame conditioning


def plate_pass(g, src, prefix):
    """Clean-Plate pass: the same shot with every person, animal and vehicle removed."""
    add_pass(g, load("ltx25_v2v.api.json"), "v2v", prefix, src)
    g[f"{prefix}.5004:5606"]["inputs"].update(lora_name=CLEAN_PLATE["lora"], strength_model=1.0)
    g[f"{prefix}.5508"]["inputs"]["value"] = CLEAN_PLATE["prompt"]
    g[f"{prefix}.5509"]["inputs"]["value"] = CLEAN_PLATE["negative"]
    g[f"{prefix}.9002:3159"]["inputs"]["strength"] = 0


def restyle_pass(g, src):
    """Union Control depth restyle (two-stage), with the depth guide stretched instead of cropped."""
    add_pass(g, load("ltx25_union_control.api.json"), "union", "fx", src)
    for nid in ("fx.9002:3159", "fx.5517:4970"):
        g[nid]["inputs"]["strength"] = 0
    # The stock graph crops the depth guide to a multiple of 64 ("cover"), the matte pass keeps the full frame.
    # Stretch instead, so both passes cover exactly the same pixels and the composite lines up at the edges.
    g["fx.depth_size"] = node("GetImageSize", image=["fx.5548:5062", 0])
    for axis, i in (("w", 0), ("h", 1)):
        g[f"fx.{axis}64"] = node("ComfyMathExpression", expression="floor(a / b) * b",
                                 **{"values.a": ["fx.depth_size", i], "values.b": ["fx.5548:5034", 1]})
    g["fx.5548:5028"] = node("ResizeImageMaskNode", input=["fx.5548:5062", 0], resize_type="scale dimensions",
                             scale_method="lanczos", **{"resize_type.width": ["fx.w64", 1], "resize_type.height": ["fx.h64", 1],
                                                        "resize_type.crop": "disabled"})


def align(g, fx_frames):
    """LTX renders 8k+1 frames: trim the original and the matte to the rendered frame count."""
    g["cmp.size"] = node("GetImageSize", image=fx_frames)
    g["cmp.orig"] = node("ImageFromBatch", image=["src.frames", 0], batch_index=0, length=["cmp.size", 2])
    g["cmp.matte_frames"] = node("ImageFromBatch", image=["matte.5518:5538", 0], batch_index=0, length=["cmp.size", 2])
    g["cmp.matte"] = node("ImageToMask", image=["cmp.matte_frames", 0], channel="red")
    g["cmp.matte_size"] = node("GetImageSize", image=["cmp.matte_frames", 0])
    # The pass output is a full-frame (stretched) render: stretch it back onto the original frame size.
    g["cmp.fx"] = node("ResizeImageMaskNode", input=fx_frames, resize_type="match size", scale_method="area",
                       **{"resize_type.match": ["cmp.orig", 0], "resize_type.crop": "disabled"})


def soft_mask(g, name, mask, grow, blur):
    """Grow (or shrink, if negative) a mask and soften its edge."""
    g[f"{name}.grow"] = node("GrowMask", mask=mask, expand=grow, tapered_corners=True)
    g[f"{name}.img"] = node("MaskToImage", mask=[f"{name}.grow", 0])
    g[f"{name}.blur"] = node("ImageBlur", image=[f"{name}.img", 0], blur_radius=blur, sigma=blur / 2)
    g[name] = node("ImageToMask", image=[f"{name}.blur", 0], channel="red")
    return [name, 0]


def opacity(g, name, mask, value):
    g[f"{name}.solid"] = node("SolidMask", value=value, width=["cmp.matte_size", 0], height=["cmp.matte_size", 1])
    g[name] = node("MaskComposite", destination=mask, source=[f"{name}.solid", 0], x=0, y=0, operation="multiply")
    return [name, 0]


def finish(g, frames, base):
    """Original sound (trimmed to the rendered length) + frames -> one SaveVideo with the app's stable id 4852."""
    create = base["5518:4849"]["inputs"]
    save = base["4852"]["inputs"]
    g["cmp.seconds"] = node("ComfyMathExpression", expression="a / b",
                            **{"values.a": ["cmp.size", 2], "values.b": ["src.components", 2]})
    g["cmp.audio"] = node("TrimAudioDuration", audio=["matte.5548:9012", 0], start_index=0.0, duration=["cmp.seconds", 0])
    g["cmp.video"] = node("CreateVideo", images=frames, fps=["src.components", 2], audio=["cmp.audio", 0],
                          **{k: v for k, v in create.items() if not is_link(v) and k != "fps"})
    g["4852"] = node("SaveVideo", video=["cmp.video", 0], **{**{k: v for k, v in save.items() if not is_link(v)},
                                                           "filename_prefix": "fxjutsu/composite"})


def build_subject():
    g = {}
    src = source(g)
    matte_pass(g, src)
    restyle_pass(g, src)
    dedupe_loaders(g)
    align(g, ["fx.5518:5538", 0])
    mask = soft_mask(g, "cmp.edge", ["cmp.matte", 0], grow=2, blur=3)
    mask = opacity(g, "cmp.mask", mask, 1.0)
    g["cmp.out"] = node("ImageCompositeMasked", destination=["cmp.orig", 0], source=["cmp.fx", 0], x=0, y=0,
                        resize_source=True, mask=mask)
    finish(g, ["cmp.out", 0], load("ltx25_v2v.api.json"))
    return g


def build_world():
    g = {}
    src = source(g)
    matte_pass(g, src)
    plate_pass(g, src, "plate")
    restyle_pass(g, {0: ["plate.5518:5538", 0], 1: src[1], 2: src[2]})  # restyle the empty plate
    dedupe_loaders(g)
    align(g, ["fx.5518:5538", 0])
    mask = soft_mask(g, "cmp.edge", ["cmp.matte", 0], grow=1, blur=3)
    mask = opacity(g, "cmp.mask", mask, 1.0)
    g["cmp.out"] = node("ImageCompositeMasked", destination=["cmp.fx", 0], source=["cmp.orig", 0], x=0, y=0,
                        resize_source=True, mask=mask)
    finish(g, ["cmp.out", 0], load("ltx25_v2v.api.json"))
    return g


def build_ghost():
    g = {}
    src = source(g)
    matte_pass(g, src)
    plate_pass(g, src, "fx")  # prompts stay app-settable (the Ghost preset sends the same clean-plate wording)
    dedupe_loaders(g)
    align(g, ["fx.5518:5538", 0])
    # 1. Fill the subject's hole with the clean plate (generous, soft edge); everything else stays original.
    hole = soft_mask(g, "cmp.hole", ["cmp.matte", 0], grow=10, blur=9)
    g["cmp.bg"] = node("ImageCompositeMasked", destination=["cmp.orig", 0], source=["cmp.fx", 0], x=0, y=0,
                       resize_source=True, mask=hole)
    # 2. Lay the subject back on top: glowing, cold-tinted, half transparent.
    g["cmp.orig_size"] = node("GetImageSize", image=["cmp.orig", 0])
    g["cmp.glow_blur"] = node("ImageBlur", image=["cmp.orig", 0], blur_radius=12, sigma=6.0)
    g["cmp.glow"] = node("ImageBlend", image1=["cmp.orig", 0], image2=["cmp.glow_blur", 0], blend_factor=0.5, blend_mode="screen")
    g["cmp.tint_color"] = node("EmptyImage", width=["cmp.orig_size", 0], height=["cmp.orig_size", 1], batch_size=1, color=0x9FD8FF)
    g["cmp.tinted"] = node("ImageBlend", image1=["cmp.glow", 0], image2=["cmp.tint_color", 0], blend_factor=0.35, blend_mode="multiply")
    mask = soft_mask(g, "cmp.edge", ["cmp.matte", 0], grow=0, blur=3)
    mask = opacity(g, "cmp.mask", mask, 0.5)
    g["cmp.out"] = node("ImageCompositeMasked", destination=["cmp.bg", 0], source=["cmp.tinted", 0], x=0, y=0,
                        resize_source=True, mask=mask)
    finish(g, ["cmp.out", 0], load("ltx25_v2v.api.json"))
    return g


def check(g, name):
    for nid, n in g.items():
        for k, v in n["inputs"].items():
            if is_link(v) and v[0] not in g:
                raise SystemExit(f"{name}: {nid}.{k} links to missing node {v[0]}")


if __name__ == "__main__":
    for name, build in (("ltx25_composite_subject.api.json", build_subject), ("ltx25_composite_world.api.json", build_world),
                        ("ltx25_composite_ghost.api.json", build_ghost)):
        g = build()
        check(g, name)
        (WF / name).write_text(json.dumps(g, indent=2) + "\n")
        print(f"{name}: {len(g)} nodes")
