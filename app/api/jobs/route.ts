import { NextResponse } from "next/server";
import { submitEffect } from "@/lib/comfy";
import { getPreset } from "@/lib/presets";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  let video: File;
  let frame: File;
  let presetId: string;
  let scene = "";
  let notes = "";
  let strength: number | undefined;
  let seed: number | undefined;
  try {
    const form = await request.formData();
    const upload = form.get("video");
    const frameUpload = form.get("frame");
    if (!(upload instanceof File) || upload.size === 0) throw new Error("Choose a video clip.");
    if (!/^video\/(mp4|quicktime|webm)$/.test(upload.type)) throw new Error("Upload an MP4, MOV or WebM clip.");
    if (upload.size > MAX_VIDEO_BYTES) throw new Error("Keep clips under 100 MB.");
    if (!(frameUpload instanceof File) || frameUpload.size === 0) throw new Error("First frame missing.");
    presetId = String(form.get("preset") ?? "");
    if (!getPreset(presetId)) throw new Error("Choose an effect.");
    scene = String(form.get("scene") ?? "").slice(0, 300);
    notes = String(form.get("notes") ?? "").slice(0, 300);
    const s = form.get("strength");
    if (s !== null && s !== "") strength = Number(s);
    const sd = form.get("seed");
    if (sd !== null && sd !== "") seed = Number(sd);
    video = upload;
    frame = frameUpload;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bad request." }, { status: 400 });
  }

  try {
    const job = await submitEffect(video, frame, { presetId, scene, notes, strength, seed });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const missingApiKey = error instanceof Error && error.message.includes("COMFY_API_KEY");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit job." },
      { status: missingApiKey ? 503 : 502 },
    );
  }
}
