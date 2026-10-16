# Deploying FXjutsu on the Comfy Developer Platform

The app talks to any server that speaks the Comfy API v2 contract. Two options:

| Mode | `COMFY_BASE_URL` | `COMFY_API_KEY` | Who pays for GPU |
|---|---|---|---|
| Local ComfyUI + `comfy-api-proxy` | `http://127.0.0.1:8189` | any string (e.g. `local`) | your own GPU |
| Comfy API deployment | `https://<deployment>.run.comfy.app` | key from https://platform.comfy.org/profile/api-keys | per GPU-second on your Comfy workspace |

## Comfy API (hosted) in six commands

Prerequisites: a Comfy workspace on a paid plan (Standard or higher, needed for Comfy API deployments), `pip install -U comfy-cli`,
and the model files + node packs on the machine you run the build from (this repo's `comfy-build.yaml` references them as local
blobs; `scripts/download-models.sh` fetches the models, the two node packs are
[ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo) and
[ComfyUI-Video-Depth-Anything](https://github.com/yuvraj108c/ComfyUI-Video-Depth-Anything)).

```bash
comfy cloud login                                  # OAuth in the browser (or: export COMFY_CLOUD_API_KEY=...)
comfy build validate .                             # checks comfy-build.yaml
comfy build push . --release --target linux/nvidia # uploads ~48 GB of model blobs (resumable), cuts a release
comfy build release ls .                           # wait for status: complete, deployable: true
comfy deploy refs compute                          # pick a GPU/region pair (RTX PRO 6000 96 GB is plenty)
comfy deploy up . --gpu <class> --region <region> --min 0 --max 1 --watch
```

`--min 0` scales to zero between jobs (no standing charge; the first job after idle pays a cold start of a few minutes while the
~48 GB of models load). The deployment URL printed by `deploy up` goes into `.env.local` as `COMFY_BASE_URL`, with your API key.

Smoke test without the app:

```bash
comfy deploy run . --workflow workflows/ltx25_v2v.api.json
```

(The stock graph references `subject_test.mp4` and `example.png`; upload your own inputs as assets first, or run through the app.)

Stop paying: `comfy deploy stop .` (keeps the release; `comfy deploy up .` brings it back). Storage for the Build's models bills
while a deployment exists in a region, including stopped ones; delete the deployment to stop that too.

## What the build contains

See `comfy-build.yaml`: ComfyUI v0.41.2 on the platform's CUDA 13 base image, 12 model files (LTX-2.5 int8 transformer and text
encoder, Gemma-4 e2b prompt enhancer, video + audio VAE, x2 spatial upscaler, six IC-LoRA adapters, Video-Depth-Anything small),
and two custom-node packs. The three workflows under `workflows/` all run on this one build.
