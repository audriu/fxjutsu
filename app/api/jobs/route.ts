import { NextResponse } from "next/server";
import { submitEffect, submitFluid } from "@/lib/comfy";
import { getPreset } from "@/lib/presets";
import { reserve, started } from "@/lib/guard";


const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  let video: File | null = null;
  let frame: File | null = null;
  let painted: { first: File; last: File; width: number; height: number } | null = null;
  let presetId: string;
  let scene = "";
  let notes = "";
  let strength: number | undefined;
  let seed: number | undefined;
  let quality: "sd" | "hd" = "sd";
  try {
    const form = await request.formData();
    presetId = String(form.get("preset") ?? "");
    const preset = getPreset(presetId);
    if (!preset) throw new Error("Choose an effect.");
    if (preset.workflow === "fluid") {
      const a = form.get("paintedFirst");
      const b = form.get("paintedLast");
      const width = Number(form.get("width"));
      const height = Number(form.get("height"));
      if (!(a instanceof File) || !(b instanceof File) || a.size === 0 || b.size === 0) throw new Error("Paint the first and last frame first.");
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 256 || height < 256) throw new Error("Bad frame size.");
      painted = { first: a, last: b, width, height };
    } else {
      const upload = form.get("video");
      const frameUpload = form.get("frame");
      if (!(upload instanceof File) || upload.size === 0) throw new Error("Choose a video clip.");
      if (!/^video\/(mp4|quicktime|webm)$/.test(upload.type)) throw new Error("Upload an MP4, MOV or WebM clip.");
      if (upload.size > MAX_VIDEO_BYTES) throw new Error("Keep clips under 100 MB.");
      if (!(frameUpload instanceof File) || frameUpload.size === 0) throw new Error("First frame missing.");
      video = upload;
      frame = frameUpload;
    }
    scene = String(form.get("scene") ?? "").slice(0, 300);
    notes = String(form.get("notes") ?? "").slice(0, 300);
    const s = form.get("strength");
    if (s !== null && s !== "") strength = Number(s);
    if (form.get("quality") === "hd") quality = "hd";
    const sd = form.get("seed");
    if (sd !== null && sd !== "") seed = Number(sd);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bad request." }, { status: 400 });
  }

  const slot = reserve();
  if (!slot.ok) return NextResponse.json({ error: slot.reason }, { status: 429 });

  try {
    const job = painted
      ? await submitFluid(painted.first, painted.last, { width: painted.width, height: painted.height }, { presetId, scene, notes, strength, seed, quality })
      : await submitEffect(video!, frame!, { presetId, scene, notes, strength, seed, quality });
    started(job.id);
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const missingApiKey = error instanceof Error && error.message.includes("COMFY_API_KEY");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit job." },
      { status: missingApiKey ? 503 : 502 },
    );
  }
}
