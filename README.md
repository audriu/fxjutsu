# FXjutsu

**Higgsfield-style VFX presets on your own footage, fully open weights.**
Upload a clip, pick an effect, get the effect rendered onto the real shot with its original sound.

Built for Comfy's [Open Source Higgsfield](https://comfy.org/open-source-higgsfield) challenge on the
[Comfy Developer Platform](https://comfy.org/platform/) (Comfy API + Comfy SDK).
Core video model: [LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5) (22B, video + audio, open weights) plus Lightricks'
IC-LoRA adapters. No partner API nodes anywhere in the pipeline.

| Preset | What it does | Adapter |
|---|---|---|
| Vanish | Removes every person, creature and vehicle, keeps the location and camera move | Clean-Plate |
| Day to Night | Relights the same shot as a moonlit night | Day-To-Night |
| Flood / Tsunami | Adds water that reacts to the scene, from a shallow flood to a tsunami | Water-Simulation |
| Alpha Matte | Pulls a clean alpha matte of the foreground, no green screen | Alpha-Gen |
| Fire & Smoke (wip) | Paint where the fire goes, get a fire/smoke simulation | AInVFX Fluid |
| Restyle (wip) | Re-render the shot in a new look while keeping its structure | Union Control (depth) |

## How it works

```
browser  ──upload clip + first frame, preset, notes──▶  Next.js API route (app/api/jobs)
                                                          │  @comfyorg/sdk: assets + workflow inputs
                                                          ▼
                                     Comfy API deployment  (or local ComfyUI via comfy-api-proxy)
                                                          │  workflows/ltx25_v2v.api.json
                                                          ▼
                                 LTX-2.5 distilled int8 + IC-LoRA adapter, 8 steps, native resolution
                                                          │
                                                          ▼
                               result video (with the source audio) ◀── polled + streamed back to the UI
```

One ComfyUI graph (the Lightricks LTX-2.5 video-to-video IC-LoRA graph, exported in API format) serves every preset;
the app only swaps the adapter, strength, prompt and inputs by node id (`lib/comfy.ts`). Prompt conventions per adapter
are documented in [`docs/adapters.md`](docs/adapters.md).

## Run it locally (24 GB GPU)

Tested on an RTX 4090: one 5-second clip renders in about 2-3 minutes.

1. ComfyUI 0.41+ with these custom nodes: [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo),
   [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) (optional), [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux),
   [ComfyUI-Video-Depth-Anything](https://github.com/yuvraj108c/ComfyUI-Video-Depth-Anything) (Restyle only).
2. Models (accept the LTX-2.x Community License on Hugging Face first; sizes are approximate):

   | Folder | File | Size |
   |---|---|---|
   | `diffusion_models/` | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | 21.5 GB |
   | `text_encoders/` | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | 15.4 GB |
   | `text_encoders/` | `gemma4_e2b_it_int8_convrot.safetensors` (prompt enhancer, from Comfy-Org/gemma-4) | 5.2 GB |
   | `vae/` | `ltx-2.5-video-vae-bf16.safetensors`, `ltx-2.5-audio-vae-bf16.safetensors` | 1.5 GB + 0.4 GB |
   | `loras/` | `ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors` | 0.3 GB |
   | `loras/` | `ltx-2.5-22b-ic-lora-day-to-night-0.9.safetensors` | 0.3 GB |
   | `loras/` | `ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors` | 0.9 GB |
   | `loras/` | `ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors` | 1.3 GB |
   | `loras/` | `ainvfx-fluid.safetensors` (from AInVFX/ainvfx-fluid, `ltx-2.5/`) | 0.65 GB |
   | `loras/` | `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` | 0.65 GB |

   All from `https://huggingface.co/Lightricks/<repo>` unless noted. `scripts/download-models.sh` fetches them with the `hf` CLI.
3. Start ComfyUI (`python main.py --listen 0.0.0.0 --port 8188`).
4. Bridge it to the Comfy API contract: `pip install comfy-api-proxy && comfy-api-proxy run --comfyui http://127.0.0.1:8188 --port 8189`
5. App:
   ```bash
   git clone https://github.com/audriu/fxjutsu && cd fxjutsu
   cp .env.example .env.local        # COMFY_BASE_URL=http://127.0.0.1:8189, COMFY_API_KEY=local
   npm ci && npm run dev             # http://localhost:3000
   ```

## Run it on the Comfy Developer Platform

The same `workflows/ltx25_v2v.api.json` deploys as a Comfy API endpoint (`comfy build init` with the models above as blobs,
`comfy build push --release --target linux/nvidia`, `comfy deploy up --gpu rtx-pro-6000-server --min 0 --max 1`).
Then set `COMFY_BASE_URL=https://<deployment>.run.comfy.app` and a real `COMFY_API_KEY`.
See `docs/deploy.md` (coming with the deployment).

## Licenses

App code: MIT. Models: LTX-2.5 and the Lightricks adapters under the LTX-2.x Community License; AInVFX Fluid under the same;
Video-Depth-Anything Small under Apache-2.0. Your footage never leaves your deployment.
