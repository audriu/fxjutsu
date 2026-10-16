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
  /** sd = shorter side 544 px (fast, ~2 min on a 4090); hd = shorter side 704 px (~1.6x slower, more VRAM). */
  quality?: "sd" | "hd";
};

// Both the v2v and union graphs size the render from the source clip: ResizeImageMaskNode "scale shorter dimension".
const RESIZE = { v2v: "5548:5026", union: "5548:5026" } as const;

// Node ids inside workflows/ltx25_union_control.api.json (Lightricks Union Control graph: depth from the clip guides a restyle).
const UNION = {
  video: "5001",
  firstFrame: "2004",
  firstFrameStrength: "9002:3159", // 1 in the stock graph: would copy the source look into frame 0; we disable it
  firstFrameStrength2: "5517:4970",
  positive: "5508",
  negative: "5509",
  lora: "5004:5607",
  seed: "5516:4832",
  seed2: "5517:4967",
  save: "4852",
} as const;

// Node ids inside workflows/ltx25_fluid.api.json (AInVFX fluid graph: painted first/last frames + black in-between frames form the control video).
const FLUID = {
  first: "9827",
  last: "9828",
  blackFrames: "9821", // EmptyImage width/height/batch_size (frames between the keyframes)
  positive: "9807",
  negative: "9806",
  lora: "9802:9724",
  seed: "9813:9745",
  save: "9816",
  firstFrameStrength: "9814:9756",
} as const;

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
  if (preset.workflow === "fluid") throw new Error("This preset needs painted keyframes; use the paint step.");
  const comfy = client();
  const map = preset.workflow === "union" ? UNION : NODE;
  const file = preset.workflow === "union" ? "ltx25_union_control.api.json" : "ltx25_v2v.api.json";
  const workflow = await comfy.workflows.fromFile(join(process.cwd(), "workflows", file));

  const videoAsset = comfy.assets.fromBytes(new Uint8Array(await video.arrayBuffer()), {
    filename: video.name || "input.mp4",
    contentType: video.type || "video/mp4",
  });
  const frameAsset = comfy.assets.fromBytes(new Uint8Array(await firstFrame.arrayBuffer()), {
    filename: firstFrame.name || "first-frame.png",
    contentType: firstFrame.type || "image/png",
  });

  const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
  workflow.setInput(map.video, "file", videoAsset);
  workflow.setInput(map.firstFrame, "image", frameAsset);
  workflow.setInput(map.firstFrameStrength, "strength", 0);
  if (preset.workflow === "union") {
    workflow.setInput(UNION.firstFrameStrength2, "strength", 0);
    workflow.setInput(UNION.seed2, "noise_seed", seed);
  }
  workflow.setInput(map.positive, "value", buildPrompt(preset, req.scene, req.notes));
  workflow.setInput(map.negative, "value", preset.negative);
  workflow.setInput(map.lora, "lora_name", preset.lora);
  workflow.setInput(map.lora, "strength_model", clamp(req.strength ?? preset.strength, 0.5, 1.6));
  workflow.setInput(map.seed, "noise_seed", seed);
  workflow.setInput(map.save, "filename_prefix", `fxjutsu/${preset.id}`);
  workflow.setInput(RESIZE[preset.workflow === "union" ? "union" : "v2v"], "resize_type.shorter_size", req.quality === "hd" ? 704 : 544);

  return publicJob(await comfy.submit(workflow));
}

/** Fluid presets: two painted keyframes (flat colour blobs over the first/last frame) drive a fire/smoke simulation. */
export async function submitFluid(
  firstPainted: File,
  lastPainted: File,
  size: { width: number; height: number },
  req: EffectRequest,
): Promise<PublicJob> {
  const preset = getPreset(req.presetId);
  if (!preset || preset.workflow !== "fluid") throw new Error("Unknown fluid preset.");
  const comfy = client();
  const workflow = await comfy.workflows.fromFile(join(process.cwd(), "workflows", "ltx25_fluid.api.json"));
  const a = comfy.assets.fromBytes(new Uint8Array(await firstPainted.arrayBuffer()), { filename: "first.png", contentType: "image/png" });
  const b = comfy.assets.fromBytes(new Uint8Array(await lastPainted.arrayBuffer()), { filename: "last.png", contentType: "image/png" });
  const width = Math.max(256, Math.floor(size.width / 64) * 64);
  const height = Math.max(256, Math.floor(size.height / 64) * 64);
  workflow.setInput(FLUID.first, "image", a);
  workflow.setInput(FLUID.last, "image", b);
  workflow.setInput(FLUID.blackFrames, "width", width);
  workflow.setInput(FLUID.blackFrames, "height", height);
  workflow.setInput(FLUID.positive, "value", buildPrompt(preset, req.scene, req.notes));
  workflow.setInput(FLUID.negative, "value", preset.negative);
  workflow.setInput(FLUID.lora, "lora_name", preset.lora);
  workflow.setInput(FLUID.lora, "strength_model", clamp(req.strength ?? preset.strength, 0.5, 1.6));
  workflow.setInput(FLUID.seed, "noise_seed", req.seed ?? Math.floor(Math.random() * 2 ** 31));
  workflow.setInput(FLUID.save, "filename_prefix", `fxjutsu/${preset.id}`);
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
