import { join } from "node:path";
import { Comfy, type Job } from "@comfyorg/sdk";
import { buildPrompt, getPreset } from "./presets";

// Node ids inside workflows/ltx25_v2v.api.json (Lightricks LTX-2.5 V2V IC-LoRA graph, API export).
const NODE = {
  video: "5001", // LoadVideo.file
  firstFrame: "2004", // LoadImage.image (first-frame conditioning input; disabled via strength 0 below)
  firstFrameStrength: "9002:3159", // LTXVImgToVideoInplace.strength
  positive: "5508", // PrimitiveStringMultiline.value
  negative: "5509",
  lora: "5004:5606", // LTXICLoRALoaderModelOnly.lora_name / strength_model
  seed: "5516:4832", // RandomNoise.noise_seed
  save: "4852", // SaveVideo.filename_prefix
} as const;

export type JobOutput = { id: string; name: string; type: string; url: string };
export type PublicJob = { id: string; status: string; outputs: JobOutput[]; error: unknown };

export type EffectRequest = {
  presetId: string;
  scene: string;
  notes: string;
  strength?: number;
  seed?: number;
};

function client() {
  const baseUrl = process.env.COMFY_BASE_URL?.trim();
  const apiKey = process.env.COMFY_API_KEY?.trim() || (baseUrl && /127\.0\.0\.1|localhost/.test(baseUrl) ? "local" : "");
  if (!apiKey) throw new Error("COMFY_API_KEY is not configured.");
  return new Comfy({ apiKey, clientInfo: "fxjutsu" });
}

function publicJob(job: Job): PublicJob {
  return {
    id: job.id,
    status: job.status,
    outputs: job.outputs.map((output) => ({
      id: output.id,
      name: output.name,
      type: output.type,
      url: `/api/jobs/${job.id}/outputs/${output.id}`,
    })),
    error: job.error,
  };
}

export async function submitEffect(video: File, firstFrame: File, req: EffectRequest): Promise<PublicJob> {
  const preset = getPreset(req.presetId);
  if (!preset) throw new Error("Unknown effect preset.");
  const comfy = client();
  const workflow = await comfy.workflows.fromFile(join(process.cwd(), "workflows", "ltx25_v2v.api.json"));

  const videoAsset = comfy.assets.fromBytes(new Uint8Array(await video.arrayBuffer()), {
    filename: video.name || "input.mp4",
    contentType: video.type || "video/mp4",
  });
  const frameAsset = comfy.assets.fromBytes(new Uint8Array(await firstFrame.arrayBuffer()), {
    filename: firstFrame.name || "first-frame.png",
    contentType: firstFrame.type || "image/png",
  });

  workflow.setInput(NODE.video, "file", videoAsset);
  workflow.setInput(NODE.firstFrame, "image", frameAsset);
  workflow.setInput(NODE.firstFrameStrength, "strength", 0);
  workflow.setInput(NODE.positive, "value", buildPrompt(preset, req.scene, req.notes));
  workflow.setInput(NODE.negative, "value", preset.negative);
  workflow.setInput(NODE.lora, "lora_name", preset.lora);
  workflow.setInput(NODE.lora, "strength_model", clamp(req.strength ?? preset.strength, 0.5, 1.6));
  workflow.setInput(NODE.seed, "noise_seed", req.seed ?? Math.floor(Math.random() * 2 ** 31));
  workflow.setInput(NODE.save, "filename_prefix", `fxjutsu/${preset.id}`);

  return publicJob(await comfy.submit(workflow));
}

export async function getJob(id: string) {
  return publicJob(await client().jobs.get(id));
}

export async function getOutput(jobId: string, outputId: string) {
  const job = await client().jobs.get(jobId);
  const output = job.outputs.find((candidate) => candidate.id === outputId);
  if (!output) throw new Error("Output not found on this job.");
  const { url } = await output.getDownloadUrl();
  return fetch(url);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}
