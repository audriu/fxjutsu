// Cost guard for a public demo deployment: caps concurrent renders and total renders per rolling 24 h.
// In-memory (per server instance); good enough for a judged demo, not a multi-instance production setting.
const MAX_CONCURRENT = Number(process.env.FXJUTSU_MAX_CONCURRENT ?? 2);
const MAX_PER_DAY = Number(process.env.FXJUTSU_MAX_PER_DAY ?? 60);
const DAY = 24 * 60 * 60 * 1000;

const active = new Map<string, number>(); // jobId -> started at
const history: number[] = []; // submit timestamps

export function reserve(): { ok: true } | { ok: false; reason: string } {
  const now = Date.now();
  for (const [id, t] of active) if (now - t > 30 * 60 * 1000) active.delete(id); // stale after 30 min
  while (history.length && now - history[0] > DAY) history.shift();
  if (active.size >= MAX_CONCURRENT) return { ok: false, reason: `The demo GPU is busy with ${active.size} render(s). Try again in a couple of minutes.` };
  if (history.length >= MAX_PER_DAY) return { ok: false, reason: "The demo's daily render budget is used up. Run FXjutsu locally or come back tomorrow." };
  return { ok: true };
}

export function started(jobId: string) {
  active.set(jobId, Date.now());
  history.push(Date.now());
}

export function finished(jobId: string) {
  active.delete(jobId);
}
