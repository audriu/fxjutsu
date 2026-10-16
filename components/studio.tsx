"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FAMILY_LABEL, PRESETS, type Preset } from "@/lib/presets";
import { PaintKeyframes, type PaintedFrames } from "@/components/paint";

type Output = { id: string; name: string; type: string; url: string };
type Job = { id: string; status: string; outputs: Output[]; error?: unknown };

const ACTIVE = ["queued", "running", "pending", "in_progress"];
const DONE = ["succeeded", "completed", "failed", "canceled", "expired", "error"];

function errorText(error: unknown): string {
  if (!error) return "The job failed.";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error && typeof (error as { message: unknown }).message === "string")
    return (error as { message: string }).message;
  return JSON.stringify(error).slice(0, 300);
}

async function extractFirstFrame(file: File): Promise<{ frame: Blob; duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = 0.04;
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return reject(new Error("Could not read the first frame."));
        resolve({ frame: blob, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      }, "image/png");
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode this video."));
    };
  });
}

export function Studio() {
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [video, setVideo] = useState<File | null>(null);
  const [frame, setFrame] = useState<Blob | null>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [scene, setScene] = useState("");
  const [notes, setNotes] = useState("");
  const [strength, setStrength] = useState<number>(PRESETS[0].strength);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Drop a 4-15 second clip to start.");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [compare, setCompare] = useState(50);
  const [painted, setPainted] = useState<PaintedFrames | null>(null);
  const startedAt = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const sourceUrl = useMemo(() => (video ? URL.createObjectURL(video) : undefined), [video]);
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  // poll
  useEffect(() => {
    if (!job || !ACTIVE.includes(job.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`);
        const next = (await res.json()) as Job & { error?: string };
        if (!res.ok) throw new Error(typeof next.error === "string" ? next.error : "Could not check the job.");
        setJob(next);
        setRetry(0);
        const secs = Math.round((Date.now() - startedAt.current) / 1000);
        setElapsed(secs);
        if (DONE.includes(next.status)) {
          setBusy(false);
          if (next.status === "succeeded" || next.status === "completed") {
            setError(false);
            setMessage(`Done in ${secs}s. Drag the slider to compare.`);
          } else {
            setError(true);
            setMessage(`${errorText(next.error)} (job ${next.id})`);
          }
        } else {
          setMessage(next.status === "queued" ? "Waiting for a GPU…" : `Rendering ${preset.name}… (${secs}s)`);
        }
      } catch (cause) {
        setError(true);
        setMessage(cause instanceof Error ? cause.message : "Could not check the job.");
        setRetry((r) => r + 1);
      }
    }, retry ? 5000 : 2500);
    return () => window.clearTimeout(timer);
  }, [job, retry, preset.name]);

  async function chooseVideo(file: File | undefined) {
    setJob(null);
    setError(false);
    setVideo(null);
    setFrame(null);
    setMeta(null);
    setPainted(null);
    if (!file) return setMessage("Drop a 4-15 second clip to start.");
    try {
      const info = await extractFirstFrame(file);
      if (info.duration < 1 || info.duration > 20) {
        setError(true);
        return setMessage("Use a clip between 1 and 20 seconds (4-8 s is the sweet spot).");
      }
      setVideo(file);
      setFrame(info.frame);
      setMeta({ duration: info.duration, width: info.width, height: info.height });
      setMessage(`Clip ready: ${info.width}x${info.height}, ${info.duration.toFixed(1)} s. Pick an effect and generate.`);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Could not read this video.");
    }
  }

  async function generate() {
    if (!video || !frame || busy) return;
    if (preset.workflow === "fluid" && !painted) { setError(true); setMessage("Paint the keyframes and click \"Use these keyframes\" first."); return; }
    setBusy(true);
    setError(false);
    setJob(null);
    startedAt.current = Date.now();
    setMessage("Uploading the clip and starting the render…");
    const form = new FormData();
    form.set("preset", preset.id);
    if (preset.workflow === "fluid" && painted) {
      form.set("paintedFirst", new File([painted.first], "first.png", { type: "image/png" }));
      form.set("paintedLast", new File([painted.last], "last.png", { type: "image/png" }));
      form.set("width", String(painted.width));
      form.set("height", String(painted.height));
    } else {
      form.set("video", video);
      form.set("frame", new File([frame], "first-frame.png", { type: "image/png" }));
    }
    form.set("scene", scene);
    form.set("notes", notes);
    form.set("strength", String(strength));
    try {
      const res = await fetch("/api/jobs", { method: "POST", body: form });
      const next = (await res.json()) as Job & { error?: string };
      if (!res.ok) throw new Error(typeof next.error === "string" ? next.error : "Could not submit the job.");
      setJob(next);
      setMessage("Submitted. Loading models…");
    } catch (cause) {
      setBusy(false);
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Could not submit the job.");
    }
  }

  // The LoadVideo node echoes the uploaded clip as an output; the rendered file is named <preset>_NNNNN_.mp4.
  const rendered = (job?.outputs ?? []).filter((o) => /\.(mp4|webm|mov)$/i.test(o.name) && !/^LTX|input/i.test(o.type + o.name) && o.name.startsWith(preset.id));
  const result = job && (job.status === "succeeded" || job.status === "completed")
    ? rendered[rendered.length - 1] ?? job.outputs.filter((o) => /\.(mp4|webm|mov)$/i.test(o.name)).at(-1)
    : undefined;

  const families = Array.from(new Set(PRESETS.map((p) => p.family)));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-zinc-100">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-400">Open Source Higgsfield · Effects</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">FXjutsu</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Drop your own footage, pick an effect, get it back with the effect rendered onto the real shot.
          100% open weights: LTX-2.5 and its IC-LoRA adapters, running through the Comfy Developer Platform.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <label className="block cursor-pointer rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-6 text-center hover:border-fuchsia-500">
            <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => chooseVideo(e.target.files?.[0])} />
            {video ? (
              <video src={sourceUrl} className="mx-auto max-h-72 rounded-lg" controls muted loop playsInline />
            ) : (
              <div className="py-10 text-zinc-400">
                <div className="text-3xl">🎬</div>
                <div className="mt-2">Click to choose a clip (MP4, MOV or WebM, up to 100 MB)</div>
                <div className="mt-1 text-xs text-zinc-500">4-8 seconds works best. Landscape or portrait.</div>
                <button type="button" className="mt-4 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-fuchsia-500"
                  onClick={async (e) => { e.preventDefault(); const r = await fetch("/samples/queen-robots.mp4"); const b = await r.blob(); chooseVideo(new File([b], "queen-robots.mp4", { type: "video/mp4" })); }}>
                  or try the sample clip
                </button>
              </div>
            )}
          </label>

          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">Effect</h2>
            {families.map((family) => (
              <div key={family} className="mb-3">
                <div className="mb-1 text-xs text-zinc-500">{FAMILY_LABEL[family]}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PRESETS.filter((p) => p.family === family).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPreset(p); setStrength(p.strength); setPainted(null); }}
                      className={`rounded-xl border p-3 text-left transition ${preset.id === p.id ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"}`}
                    >
                      <div className="text-xl">{p.emoji}</div>
                      <div className="mt-1 font-medium">{p.name}</div>
                      <div className="text-xs text-zinc-400">{p.tagline}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {preset.workflow === "fluid" && frame && (
            <PaintKeyframes frame={frame} onChange={setPainted} />
          )}

          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <label className="block text-sm">
              <span className="text-zinc-400">What is in the shot? (one line, helps the model)</span>
              <input value={scene} onChange={(e) => setScene(e.target.value)} maxLength={300} placeholder="a woman walking down a city street at noon"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500" />
            </label>
            {preset.acceptsNotes && (
              <label className="block text-sm">
                <span className="text-zinc-400">Extra direction (optional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="warm sodium street lights, light rain"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500" />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-zinc-400">Intensity {strength.toFixed(2)}</span>
              <input type="range" min={0.6} max={1.5} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="mt-1 w-full accent-fuchsia-500" />
            </label>
            <button type="button" disabled={!video || busy} onClick={generate}
              className="w-full rounded-xl bg-fuchsia-600 px-4 py-3 font-medium text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:bg-zinc-700">
              {busy ? "Rendering…" : preset.workflow === "fluid" && !painted ? "Paint keyframes to continue" : `Apply ${preset.name}`}
            </button>
            <p className={`text-sm ${error ? "text-rose-400" : "text-zinc-400"}`}>{message}</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">Result</h2>
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-black">
            {result ? (
              <div className="relative">
                <video src={result.url} className="block w-full" controls autoPlay loop muted playsInline />
                {sourceUrl && (
                  <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                    <video src={sourceUrl} className="block w-full" autoPlay loop muted playsInline />
                    <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs">BEFORE</div>
                  </div>
                )}
                <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs">AFTER</div>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center text-zinc-600">{busy ? "Rendering…" : "Your result appears here"}</div>
            )}
          </div>
          {result && (
            <>
              <label className="block text-sm">
                <span className="text-zinc-400">Before / after</span>
                <input type="range" min={0} max={100} value={compare} onChange={(e) => setCompare(Number(e.target.value))} className="mt-1 w-full accent-fuchsia-500" />
              </label>
              <div className="flex flex-wrap gap-2">
                {(rendered.length ? rendered : job?.outputs ?? []).map((o) => (
                  <a key={o.id} href={o.url} download={o.name} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-fuchsia-500">
                    Download {o.name}
                  </a>
                ))}
              </div>
            </>
          )}
          {meta && (
            <p className="text-xs text-zinc-500">
              Source {meta.width}x{meta.height}, {meta.duration.toFixed(1)} s{elapsed ? ` · last render ${elapsed}s` : ""}. Output is rendered at 960x544-class resolution, 8k+1 frames, with the original audio.
            </p>
          )}
        </div>
      </section>

      <footer className="mt-12 text-xs text-zinc-600">
        Built for Comfy&apos;s Open Source Higgsfield challenge. Models: LTX-2.5 (Lightricks, LTX-2.x Community License) + IC-LoRA adapters. MIT-licensed app.
      </footer>
    </main>
  );
}
