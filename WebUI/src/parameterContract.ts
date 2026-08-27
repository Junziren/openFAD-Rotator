import type { NativeState } from "./nativeBridge";

export const speedModeOptions = ["STOP", "SLOW", "FAST", "FREE", "SYNC"] as const;
export const syncDivisionOptions = ["1/32", "1/16", "1/8", "1/4", "1/2", "1 BAR", "2 BARS", "4 BARS", "8 BARS"] as const;
export const modelOptions = [
  "Pocket Radio",
  "Console Coax",
  "Cinema Horn",
  "British Shelf",
  "American Tower",
  "Nearfield Monitor",
  "PA Stack",
  "Modern Reference",
] as const;
export const structureOptions = ["Horn + Drum", "Eccentric Ports", "Prism Diffuser"] as const;
export const feedModeOptions = ["Mono Sum", "Linked Stereo", "Dual Rotor"] as const;
export const renderModeOptions = ["Binaural", "Speaker Stereo"] as const;
export const qualityOptions = ["Live", "Studio"] as const;

export type PluginValues = {
  inputTrim: number;
  outputTrim: number;
  mix: number;
  bypass: boolean;
  quality: number;
  model: number;
  modelBypass: boolean;
  drive: number;
  resonance: number;
  damping: number;
  loudnessMatch: boolean;
  structure: number;
  feedMode: number;
  renderMode: number;
  speedMode: number;
  freeRate: number;
  syncDivision: number;
  inertia: number;
  direction: number;
  depth: number;
  distance: number;
  angle: number;
  earlyReflections: number;
  roomDamping: number;
  modelAmount: number;
  rotatorAmount: number;
  dreamBypass: boolean;
  predelay: number;
  predelaySync: boolean;
  diffusion: number;
  tail: number;
  microshift: number;
  dreamDamping: number;
  feedback: number;
  freeze: boolean;
  character: number;
  motion: number;
  space: number;
  dream: number;
  bpm: number;
};

export const defaultPluginValues: PluginValues = {
  inputTrim: 0,
  outputTrim: 0,
  mix: 0.35,
  bypass: false,
  quality: 0,
  model: 1,
  modelBypass: false,
  drive: 0.2,
  resonance: 0.35,
  damping: 0.5,
  loudnessMatch: true,
  structure: 0,
  feedMode: 0,
  renderMode: 0,
  speedMode: 1,
  freeRate: 0.8,
  syncDivision: 5,
  inertia: 2.2,
  direction: 0,
  depth: 0.75,
  distance: 1.2,
  angle: 0,
  earlyReflections: 0.25,
  roomDamping: 0.55,
  modelAmount: 1,
  rotatorAmount: 1,
  dreamBypass: false,
  predelay: 0.035,
  predelaySync: false,
  diffusion: 0.45,
  tail: 3.5,
  microshift: 8,
  dreamDamping: 0.35,
  feedback: 0.58,
  freeze: false,
  character: 0.35,
  motion: 0.35,
  space: 0.3,
  dream: 0.25,
  bpm: 120,
};

type Range = { minimum: number; maximum: number };
const ranges: Partial<Record<keyof PluginValues, Range>> = {
  inputTrim: { minimum: -24, maximum: 24 },
  outputTrim: { minimum: -24, maximum: 12 },
  mix: { minimum: 0, maximum: 1 },
  drive: { minimum: 0, maximum: 1 },
  resonance: { minimum: 0, maximum: 1 },
  damping: { minimum: 0, maximum: 1 },
  freeRate: { minimum: 0.02, maximum: 20 },
  inertia: { minimum: 0.05, maximum: 12 },
  depth: { minimum: 0, maximum: 1 },
  distance: { minimum: 0.5, maximum: 3 },
  angle: { minimum: -45, maximum: 45 },
  earlyReflections: { minimum: 0, maximum: 1 },
  roomDamping: { minimum: 0, maximum: 1 },
  modelAmount: { minimum: 0, maximum: 1 },
  rotatorAmount: { minimum: 0, maximum: 1 },
  predelay: { minimum: 0, maximum: 0.25 },
  diffusion: { minimum: 0, maximum: 1 },
  tail: { minimum: 0.2, maximum: 12 },
  microshift: { minimum: 0, maximum: 25 },
  dreamDamping: { minimum: 0, maximum: 1 },
  feedback: { minimum: 0, maximum: 0.96 },
  character: { minimum: 0, maximum: 1 },
  motion: { minimum: 0, maximum: 1 },
  space: { minimum: 0, maximum: 1 },
  dream: { minimum: 0, maximum: 1 },
};

const choiceMaximum: Partial<Record<keyof PluginValues, number>> = {
  quality: 1,
  model: 7,
  structure: 2,
  feedMode: 2,
  renderMode: 1,
  speedMode: 4,
  syncDivision: 8,
  direction: 1,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalisedValue(state: NativeState, id: string, fallback: number) {
  const row = state.parameters?.find((parameter) => parameter.id === id);
  return row && Number.isFinite(row.value) ? clamp(row.value, 0, 1) : fallback;
}

function readValue<K extends keyof PluginValues>(state: NativeState, id: K, fallback: number): number {
  const choiceMax = choiceMaximum[id];
  if (choiceMax !== undefined) return Math.round(normalisedValue(state, id, fallback / choiceMax) * choiceMax);
  const range = ranges[id];
  if (!range) return normalisedValue(state, id, fallback);
  return range.minimum + normalisedValue(state, id, (fallback - range.minimum) / (range.maximum - range.minimum)) * (range.maximum - range.minimum);
}

function readBoolean(state: NativeState, id: keyof PluginValues, fallback: boolean) {
  return normalisedValue(state, id, fallback ? 1 : 0) >= 0.5;
}

export function parsePluginValues(state: NativeState, bpmFallback = defaultPluginValues.bpm): PluginValues {
  const values: PluginValues = {
    ...defaultPluginValues,
    inputTrim: readValue(state, "inputTrim", defaultPluginValues.inputTrim),
    outputTrim: readValue(state, "outputTrim", defaultPluginValues.outputTrim),
    mix: readValue(state, "mix", defaultPluginValues.mix),
    bypass: readBoolean(state, "bypass", defaultPluginValues.bypass),
    quality: readValue(state, "quality", defaultPluginValues.quality),
    model: readValue(state, "model", defaultPluginValues.model),
    modelBypass: readBoolean(state, "modelBypass", defaultPluginValues.modelBypass),
    drive: readValue(state, "drive", defaultPluginValues.drive),
    resonance: readValue(state, "resonance", defaultPluginValues.resonance),
    damping: readValue(state, "damping", defaultPluginValues.damping),
    loudnessMatch: readBoolean(state, "loudnessMatch", defaultPluginValues.loudnessMatch),
    structure: readValue(state, "structure", defaultPluginValues.structure),
    feedMode: readValue(state, "feedMode", defaultPluginValues.feedMode),
    renderMode: readValue(state, "renderMode", defaultPluginValues.renderMode),
    speedMode: readValue(state, "speedMode", defaultPluginValues.speedMode),
    freeRate: readValue(state, "freeRate", defaultPluginValues.freeRate),
    syncDivision: readValue(state, "syncDivision", defaultPluginValues.syncDivision),
    inertia: readValue(state, "inertia", defaultPluginValues.inertia),
    direction: readValue(state, "direction", defaultPluginValues.direction),
    depth: readValue(state, "depth", defaultPluginValues.depth),
    distance: readValue(state, "distance", defaultPluginValues.distance),
    angle: readValue(state, "angle", defaultPluginValues.angle),
    earlyReflections: readValue(state, "earlyReflections", defaultPluginValues.earlyReflections),
    roomDamping: readValue(state, "roomDamping", defaultPluginValues.roomDamping),
    modelAmount: readValue(state, "modelAmount", defaultPluginValues.modelAmount),
    rotatorAmount: readValue(state, "rotatorAmount", defaultPluginValues.rotatorAmount),
    dreamBypass: readBoolean(state, "dreamBypass", defaultPluginValues.dreamBypass),
    predelay: readValue(state, "predelay", defaultPluginValues.predelay),
    predelaySync: readBoolean(state, "predelaySync", defaultPluginValues.predelaySync),
    diffusion: readValue(state, "diffusion", defaultPluginValues.diffusion),
    tail: readValue(state, "tail", defaultPluginValues.tail),
    microshift: readValue(state, "microshift", defaultPluginValues.microshift),
    dreamDamping: readValue(state, "dreamDamping", defaultPluginValues.dreamDamping),
    feedback: readValue(state, "feedback", defaultPluginValues.feedback),
    freeze: readBoolean(state, "freeze", defaultPluginValues.freeze),
    character: readValue(state, "character", defaultPluginValues.character),
    motion: readValue(state, "motion", defaultPluginValues.motion),
    space: readValue(state, "space", defaultPluginValues.space),
    dream: readValue(state, "dream", defaultPluginValues.dream),
    bpm: Number.isFinite(state.bpm) ? clamp(state.bpm as number, 20, 300) : bpmFallback,
  };
  return values;
}

export function activeRotorRate(values: PluginValues) {
  switch (values.speedMode) {
    case 0: return 0;
    case 1: return 0.8;
    case 2: return 6.5;
    case 3: return values.freeRate;
    case 4: {
      const divisions = [8, 4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
      return values.bpm / 60 * (divisions[values.syncDivision] ?? divisions[5]);
    }
    default: return 0.8;
  }
}

export function normalisedForParameter(id: keyof PluginValues, actualValue: number | boolean) {
  const value = typeof actualValue === "boolean" ? (actualValue ? 1 : 0) : actualValue;
  const choiceMax = choiceMaximum[id];
  if (choiceMax !== undefined) return clamp(Math.round(value) / choiceMax, 0, 1);
  const range = ranges[id];
  if (!range) return clamp(value, 0, 1);
  return clamp((value - range.minimum) / (range.maximum - range.minimum), 0, 1);
}

