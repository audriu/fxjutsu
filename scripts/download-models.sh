#!/usr/bin/env bash
# Downloads every model FXjutsu needs into a ComfyUI models directory.
# Usage: HF_TOKEN=hf_... scripts/download-models.sh /path/to/ComfyUI/models
# Requires the `hf` CLI (pip install -U huggingface_hub) and acceptance of the LTX-2.x Community License on
# https://huggingface.co/Lightricks/LTX-2.5 and the adapter repos listed below (one click each, instant).
set -euo pipefail
M=${1:?models dir}
T=$(mktemp -d)
get() { # get <repo> <file-in-repo> <dest-subdir> [dest-name]
  local name=${4:-$(basename "$2")}
  if [ -f "$M/$3/$name" ]; then echo "[skip] $3/$name"; return; fi
  echo "[get ] $1 :: $2"
  hf download "$1" "$2" --local-dir "$T" >/dev/null
  mkdir -p "$M/$3" && mv "$T/$2" "$M/$3/$name"
}
get Lightricks/LTX-2.5 diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors diffusion_models
get Lightricks/LTX-2.5 text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors text_encoders
get Comfy-Org/gemma-4 text_encoders/gemma4_e2b_it_int8_convrot.safetensors text_encoders
get Lightricks/LTX-2.5 vae/ltx-2.5-video-vae-bf16.safetensors vae
get Lightricks/LTX-2.5 vae/ltx-2.5-audio-vae-bf16.safetensors vae
get Lightricks/LTX-2.5 latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors latent_upscale_models
get Lightricks/LTX-2.5-22b-IC-LoRA-Clean-Plate ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors loras
get Lightricks/LTX-2.5-22b-IC-LoRA-Day-To-Night ltx-2.5-22b-ic-lora-day-to-night-0.9.safetensors loras
get Lightricks/LTX-2.5-22b-IC-LoRA-Water-Simulation ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors loras
get Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors loras
get Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors loras
get AInVFX/ainvfx-fluid ltx-2.5/ainvfx-fluid.safetensors loras ainvfx-fluid.safetensors
rm -rf "$T"
echo "done: $(du -sh "$M" | cut -f1) in $M"
