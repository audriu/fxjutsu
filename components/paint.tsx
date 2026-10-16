"use client";
import { useEffect, useRef, useState } from "react";

export type PaintedFrames = { first: Blob; last: Blob; width: number; height: number };

const COLORS: { name: string; hex: string }[] = [
  { name: "Fire", hex: "#ff8c00" },
  { name: "Flame core", hex: "#ffe03c" },
  { name: "Smoke", hex: "#7a7a7a" },
  { name: "Steam", hex: "#f0f0f0" },
  { name: "Erase", hex: "erase" },
];

/** Paint flat colour blobs over the clip's first frame: one canvas for the START state, one for the END state. */
export function PaintKeyframes({ frame, onChange }: { frame: Blob; onChange: (p: PaintedFrames | null) => void }) {
  const [state, setState] = useState<"start" | "end">("start");
  const [color, setColor] = useState(COLORS[0].hex);
  const [size, setSize] = useState(60);
  const base = useRef<HTMLImageElement | null>(null);
  const layers = useRef<{ start: HTMLCanvasElement; end: HTMLCanvasElement } | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(frame);
    const img = new Image();
    img.onload = () => {
      // Fluid adapter wants multiples of 64; keep the long edge at or below 1280.
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const w = Math.max(256, Math.floor((img.width * scale) / 64) * 64);
      const h = Math.max(256, Math.floor((img.height * scale) / 64) * 64);
      base.current = img;
      const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
      layers.current = { start: mk(), end: mk() };
      setDims({ w, h });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [frame]);

  useEffect(() => { render(); });

  function render() {
    const v = view.current; const img = base.current; const L = layers.current;
    if (!v || !img || !L || !dims) return;
    v.width = dims.w; v.height = dims.h;
    const ctx = v.getContext("2d")!;
    ctx.drawImage(img, 0, 0, dims.w, dims.h);
    ctx.drawImage(L[state], 0, 0);
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  }

  function dab(e: React.PointerEvent<HTMLCanvasElement>) {
    const L = layers.current; if (!L) return;
    const ctx = L[state].getContext("2d")!;
    const { x, y } = pos(e);
    ctx.globalCompositeOperation = color === "erase" ? "destination-out" : "source-over";
    ctx.fillStyle = color === "erase" ? "#000" : color;
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
    render();
  }

  async function exportFrames() {
    const img = base.current; const L = layers.current; if (!img || !L || !dims) return;
    const flat = async (layer: HTMLCanvasElement) => {
      const c = document.createElement("canvas"); c.width = dims.w; c.height = dims.h;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, dims.w, dims.h); ctx.drawImage(layer, 0, 0);
      return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
    };
    onChange({ first: await flat(L.start), last: await flat(L.end), width: dims.w, height: dims.h });
  }

  function copyStartToEnd() {
    const L = layers.current; if (!L) return;
    const ctx = L.end.getContext("2d")!; ctx.clearRect(0, 0, L.end.width, L.end.height); ctx.drawImage(L.start, 0, 0);
    setState("end");
  }

  function clear() {
    const L = layers.current; if (!L) return;
    L[state].getContext("2d")!.clearRect(0, 0, L[state].width, L[state].height); render(); onChange(null);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-400">Paint the</span>
        {(["start", "end"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setState(s)} className={`rounded px-2 py-1 ${state === s ? "bg-fuchsia-600 text-white" : "bg-zinc-800 text-zinc-300"}`}>{s === "start" ? "START frame" : "END frame"}</button>
        ))}
        <span className="mx-1 text-zinc-600">|</span>
        {COLORS.map((c) => (
          <button key={c.hex} type="button" onClick={() => setColor(c.hex)} title={c.name} className={`h-6 w-6 rounded-full border-2 ${color === c.hex ? "border-white" : "border-zinc-700"}`} style={{ background: c.hex === "erase" ? "repeating-linear-gradient(45deg,#333 0 4px,#666 4px 8px)" : c.hex }} />
        ))}
        <input type="range" min={10} max={200} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-fuchsia-500" title="Brush size" />
        <button type="button" onClick={copyStartToEnd} className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">Copy start → end</button>
        <button type="button" onClick={clear} className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">Clear</button>
        <button type="button" onClick={exportFrames} className="rounded bg-emerald-700 px-2 py-1 text-white">Use these keyframes</button>
      </div>
      <canvas
        ref={view}
        className="w-full cursor-crosshair touch-none rounded-lg"
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); dab(e); }}
        onPointerMove={(e) => { if (drawing.current) dab(e); }}
        onPointerUp={(e) => { drawing.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerLeave={() => { drawing.current = false; }}
      />
      <p className="text-xs text-zinc-500">
        Flat blobs work best: orange + yellow for fire, grey for smoke. Paint a small shape on the START frame and a bigger one on the END frame; the simulation grows between them. The shot is re-generated from your first frame.
      </p>
    </div>
  );
}
