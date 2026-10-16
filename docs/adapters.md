# LTX-2.5 IC-LoRA adapter conventions (from the Lightricks model cards, read 2026-10-16)

All: use the Lightricks `LTX-2.5_V2V_ICLoRA_Single_Stage_Distilled` graph (reference video -> IC-LoRA guide), distilled base,
LoRA strength 1.0 unless noted, CFG 1.0 (distilled, 8 fixed sigmas), frames = 8k+1, dims divisible by 32, 24 fps reference.
Stage-1 only at native resolution (the two-stage upscaler drops the reference conditioning and drifts).

| Adapter | File | Prompt convention | Notes |
|---|---|---|---|
| Clean-Plate ("Vanish") | ltx-2.5-22b-ic-lora-clean-plate-1.0 | Describe the *empty* scene ("An empty clean plate of the exact same location: identical background... no people, no figures..."); put subjects in the negative; name stubborn objects in both | No mask (global removal). Trained 1024x576x49 @25fps; HD validated. Needs an audio track on the input (add silence). Fails when the subject fills the frame. |
| Day-To-Night | ...-day-to-night-0.9 | Describe the night look ("A realistic nighttime scene ... photorealistic moonlight, deep natural shadows. Only the lighting changes...") | Trained 768x448x97 @24fps. Guidance 3-4 on dev base; distilled works (tested OK). Too dark -> lower guidance, add "pitch black, underexposed" to negative. Resample reference to 24 fps. |
| Water-Simulation ("Flood") TESTED OK @1.25 (drift) | ...-water-simulation-0.9 | Dual-panel: "Reference shows <dry scene>. Edited shows the same scene with water added.\nADD WATER <vivid water description>" — literal trigger `ADD WATER` required | Strength 1.0-1.05 natural; 1.1-1.5 surface replacement (ground->sea); 1.25/1.45 tsunami drama. No negative prompt. Whole frame (no mask). Up to 185 frames. |
| Alpha-Gen (matte) | ...-alpha-gen-0.9 | Empty prompt | Outputs grayscale matte (white=fg). <=145 frames, <=1920x1088, pad to /32 and 8n+1. No object selection (mattes everything that is foreground). |
| Ingredients | ...-ingredients-0.9 | "Reference sheet: <panels>\n\nGenerated video: <action>" | Reference sheet image looped as a static video; 768x448x121; strength 1.4 (2.3 card), steps 30, cfg 4 on dev. |
| Union Control (2.3 adapter, works on 2.5) | ltx-2.3-22b-ic-lora-union-control-ref0.5 | Normal prompt; guide = depth/canny/pose video | Tested OK with MoGe depth on 2.3 (restyle-on-structure). |
| Relight (2.3) | ltx-2.3-22b-ic-lora-relight-1.0 | sun direction in prompt (see card) | 2.3 adapter; test on 2.5 base. |
| Layout-To-Render | ...-layout-to-render-1.0 | 3D viewport/playblast -> finished shot | For previz; low priority. |
| AInVFX Fluid (community) | ainvfx-fluid-ltx-2.5 | paint blobs -> smoke/fire (see repo card) | Fire / smoke presets. |

Test log: Clean-Plate PASS, Day-To-Night PASS, Water (plain prompt) no effect -> retry with ADD WATER format at 1.25.
