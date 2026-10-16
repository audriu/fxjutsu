// FXjutsu effect catalog. Each preset maps to one open-weights LTX-2.5 IC-LoRA adapter
// applied through the Lightricks video-to-video graph (workflows/ltx25_v2v.api.json).
// Prompt conventions follow the adapter model cards (see docs/adapters.md).

export type Family = "subject" | "world" | "elemental" | "utility";

export type Preset = {
  id: string;
  name: string;
  tagline: string;
  family: Family;
  lora: string;
  strength: number;
  /** Positive prompt. `{scene}` is replaced by the user's one-line scene description (or a generic phrase). */
  prompt: string;
  negative: string;
  /** Whether the user's extra notes are appended to the prompt. */
  acceptsNotes: boolean;
  emoji: string;
};

export const PRESETS: Preset[] = [
  {
    id: "vanish",
    name: "Vanish",
    tagline: "Remove every person, creature and vehicle. Keep the location.",
    family: "subject",
    lora: "ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors",
    strength: 1.0,
    prompt:
      "An empty clean plate of the exact same location: identical background, environment, structures, camera motion and lighting as the source video, with no people, no humans, no figures, no animals, no vehicles and no body parts anywhere in the frame. {scene}",
    negative:
      "person, people, human, figure, limb, arm, hand, leg, body part, animal, vehicle, robot, character, shadow of a person, leftover people, leftover figures, ghosting, semi-transparent remnants, blurry, soft, distorted, inconsistent motion, jitter",
    acceptsNotes: true,
    emoji: "🫥",
  },
  {
    id: "night",
    name: "Day to Night",
    tagline: "Relight the shot as a moonlit night. Same motion, same framing.",
    family: "world",
    lora: "ltx-2.5-22b-ic-lora-day-to-night-0.9.safetensors",
    strength: 1.0,
    prompt:
      "A realistic nighttime version of the same shot: deep blue night sky with stars, photorealistic moonlight, deep natural shadows, cool highlights, practical lights glowing where lamps or screens exist. Only the lighting changes from day to night; identical composition, framing, camera motion and subjects. {scene}",
    negative: "daytime, sun, bright daylight, pitch black, underexposed, crushed shadows, blurry, distorted",
    acceptsNotes: true,
    emoji: "🌙",
  },
  {
    id: "flood",
    name: "Flood",
    tagline: "Shallow rushing water fills the scene and reacts to everything in it.",
    family: "elemental",
    lora: "ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors",
    strength: 1.15,
    prompt:
      "Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER a clear shallow flood rushing across the ground, flowing around legs and objects with white foam crests, ripples, splashes and reflections of the sky on the water surface.",
    negative: "",
    acceptsNotes: true,
    emoji: "🌊",
  },
  {
    id: "tsunami",
    name: "Tsunami",
    tagline: "A wall of churning water crashes through the shot.",
    family: "elemental",
    lora: "ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors",
    strength: 1.35,
    prompt:
      "Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER a colossal tsunami wall of churning blue-green water surging through the scene, crashing waves, heavy spray and splashes, foam, everything partially submerged.",
    negative: "",
    acceptsNotes: true,
    emoji: "🌪️",
  },
  {
    id: "matte",
    name: "Alpha Matte",
    tagline: "Pull a clean alpha matte of the foreground. No green screen needed.",
    family: "utility",
    lora: "ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors",
    strength: 1.0,
    prompt: "",
    negative: "",
    acceptsNotes: false,
    emoji: "🎭",
  },
];

export const FAMILY_LABEL: Record<Family, string> = {
  subject: "Subject",
  world: "World",
  elemental: "Elemental",
  utility: "Compositing",
};

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function buildPrompt(preset: Preset, scene: string, notes: string): string {
  const sceneText = scene.trim() || "the scene from the source video";
  let text = preset.prompt.replace("{scene}", sceneText).trim();
  if (preset.acceptsNotes && notes.trim()) text = `${text} ${notes.trim()}`;
  return text;
}
