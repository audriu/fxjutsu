// FXjutsu effect catalog. Each preset maps to one open-weights LTX-2.5 IC-LoRA adapter
// applied through the Lightricks video-to-video graph (workflows/ltx25_v2v.api.json).
// Prompt conventions follow the adapter model cards (see docs/adapters.md).

export type Family = "subject" | "world" | "elemental" | "look" | "utility";
export type WorkflowKind = "v2v" | "union" | "fluid";

export type Preset = {
  id: string;
  name: string;
  tagline: string;
  family: Family;
  /** Which graph runs this preset. v2v = reference-video IC-LoRA edit, union = depth-guided restyle, fluid = painted-keyframe simulation. */
  workflow: WorkflowKind;
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
    workflow: "v2v",
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
    workflow: "v2v",
    lora: "ltx-2.5-22b-ic-lora-day-to-night-0.9.safetensors",
    strength: 1.0,
    prompt:
      "A realistic nighttime version of the same shot: deep blue night sky with stars, photorealistic moonlight, deep natural shadows, cool highlights, practical lights glowing where lamps or screens exist. Only the lighting changes from day to night; identical composition, framing, camera motion and subjects. {scene}",
    negative: "daytime, sun, bright daylight, pitch black, underexposed, crushed shadows, blurry, distorted",
    acceptsNotes: true,
    emoji: "🌙",
  },
  {
    id: "rain",
    name: "Rainy Day",
    tagline: "Wet, reflective streets and a damp overcast mood. Subtle and realistic.",
    family: "elemental",
    workflow: "v2v",
    lora: "ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors",
    strength: 1.1,
    prompt:
      "Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER rain-soaked ground with puddles and mirror-like reflections, light rain falling, wet surfaces glistening, drips and small splashes with each step.",
    negative: "",
    acceptsNotes: true,
    emoji: "🌧️",
  },
  {
    id: "flood",
    name: "Flood",
    tagline: "Knee-deep water fills the scene and reacts to everything moving in it.",
    family: "elemental",
    workflow: "v2v",
    lora: "ltx-2.5-22b-ic-lora-water-simulation-0.9.safetensors",
    strength: 1.3,
    prompt:
      "Reference shows {scene}. Edited shows the same scene with water added.\nADD WATER the entire ground replaced by knee-deep flood water, a wide expanse of murky water flowing across the scene, waves and wakes around legs, wheels and objects, white foam, splashes with every movement, reflections of the surroundings on the water surface.",
    negative: "",
    acceptsNotes: true,
    emoji: "🌊",
  },
  {
    id: "tsunami",
    name: "Tsunami",
    tagline: "A wall of churning water crashes through the shot.",
    family: "elemental",
    workflow: "v2v",
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
    workflow: "v2v",
    lora: "ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors",
    strength: 1.0,
    prompt: "",
    negative: "",
    acceptsNotes: false,
    emoji: "🎭",
  },
  {
    id: "fire",
    name: "Set on Fire",
    tagline: "Paint where the flames go. The shot is re-generated with a fire and smoke simulation.",
    family: "elemental",
    workflow: "fluid",
    lora: "ainvfx-fluid.safetensors",
    strength: 1.0,
    prompt: "ainvfxfluid, roaring orange and yellow flames with thick grey smoke rising where painted, fire light flickering on the surroundings, {scene}",
    negative: "blurry, low quality, distorted, watermark",
    acceptsNotes: true,
    emoji: "🔥",
  },
  {
    id: "smoke",
    name: "Smoke",
    tagline: "Paint a plume. Get drifting smoke or steam that follows your shape.",
    family: "elemental",
    workflow: "fluid",
    lora: "ainvfx-fluid.safetensors",
    strength: 1.0,
    prompt: "ainvfxfluid, a thick plume of grey smoke rising and drifting where painted, soft volumetric lighting, {scene}",
    negative: "blurry, low quality, distorted, watermark",
    acceptsNotes: true,
    emoji: "💨",
  },
  {
    id: "clay",
    name: "Claymation",
    tagline: "Re-render the shot as stop-motion plasticine. Structure and motion stay.",
    family: "look",
    workflow: "union",
    lora: "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
    strength: 1.0,
    prompt: "The same scene rendered as a claymation stop-motion film: every subject is a plasticine figure with fingerprints and matte surfaces, the environment is sculpted clay and felt, soft studio lighting, identical composition, framing and camera motion as the source. {scene}",
    negative: "photorealistic, blurry, distorted, jittery, inconsistent motion",
    acceptsNotes: true,
    emoji: "🧱",
  },
  {
    id: "ice",
    name: "Frozen",
    tagline: "Everything turns to ice and frost. Same shapes, same motion.",
    family: "look",
    workflow: "union",
    lora: "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
    strength: 1.0,
    prompt: "The same scene frozen solid: every surface and subject covered in translucent blue ice and white frost, icicles, cold winter light, frozen breath in the air, identical composition, framing and camera motion as the source. {scene}",
    negative: "warm, summer, blurry, distorted, jittery, inconsistent motion",
    acceptsNotes: true,
    emoji: "🧊",
  },
  {
    id: "anime",
    name: "Anime",
    tagline: "A hand-drawn anime look over your real footage.",
    family: "look",
    workflow: "union",
    lora: "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
    strength: 1.0,
    prompt: "The same scene as a high-quality 2D anime: clean line art, cel shading, vibrant painted backgrounds, expressive characters, identical composition, framing and camera motion as the source. {scene}",
    negative: "photorealistic, 3d render, blurry, distorted, jittery",
    acceptsNotes: true,
    emoji: "✨",
  },
];

export const FAMILY_LABEL: Record<Family, string> = {
  subject: "Subject",
  world: "World",
  elemental: "Elemental",
  look: "Look",
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
