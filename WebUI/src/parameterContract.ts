import type { NativeState, SpeakerProfile } from "./nativeBridge";

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

export const defaultSpeakerProfiles: readonly SpeakerProfile[] = [
  { id: "pocket-radio", name: "Pocket Radio", lowCut: 0.015, highCut: 0.24, lowGain: 1.18, midGain: 1.22, highGain: 0.66, lowMidGain: 1.32, presenceGain: 1.18, airGain: 0.72, description: "Small enclosure, forward midrange, softened air." },
  { id: "console-coax", name: "Console Coax", lowCut: 0.009, highCut: 0.35, lowGain: 1.08, midGain: 1.08, highGain: 0.94, lowMidGain: 1.15, presenceGain: 1.06, airGain: 0.92, description: "Warm low-mid body with restrained top end." },
  { id: "cinema-horn", name: "Cinema Horn", lowCut: 0.012, highCut: 0.42, lowGain: 1.24, midGain: 0.96, highGain: 1.18, lowMidGain: 0.92, presenceGain: 1.18, airGain: 1.22, description: "Large low-end bloom and articulate horn presence." },
  { id: "british-shelf", name: "British Shelf", lowCut: 0.006, highCut: 0.38, lowGain: 1.04, midGain: 1.12, highGain: 0.88, lowMidGain: 1.18, presenceGain: 1.08, airGain: 0.82, description: "Soft upper shelf with a lightly voiced center." },
  { id: "american-tower", name: "American Tower", lowCut: 0.004, highCut: 0.48, lowGain: 1.12, midGain: 1.02, highGain: 1.12, lowMidGain: 1.06, presenceGain: 1.04, airGain: 1.2, description: "Broad low-frequency scale and bright projection." },
  { id: "nearfield-monitor", name: "Nearfield Monitor", lowCut: 0.002, highCut: 0.62, lowGain: 0.98, midGain: 1.0, highGain: 1.26, lowMidGain: 0.94, presenceGain: 1.04, airGain: 1.32, description: "Tight low end and extended, revealing highs." },
  { id: "pa-stack", name: "PA Stack", lowCut: 0.02, highCut: 0.31, lowGain: 1.3, midGain: 0.9, highGain: 0.72, lowMidGain: 1.28, presenceGain: 0.88, airGain: 0.68, description: "Dense low push, controlled mids, roughened top." },
  { id: "modern-reference", name: "Modern Reference", lowCut: 0.001, highCut: 0.8, lowGain: 1.0, midGain: 1.04, highGain: 1.16, lowMidGain: 1.0, presenceGain: 1.08, airGain: 1.24, description: "Wide-range neutral base with a polished air band." },
];

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
  dopplerAmount: number;
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

export type ParameterHelp = {
  cn: string;
  description: string;
};

// Short, task-focused copy shared by the in-app tooltip layer. The native
// parameter IDs remain the source of truth; this is display guidance only.
export const parameterHelp: Partial<Record<keyof PluginValues, ParameterHelp>> = {
  inputTrim: { cn: "输入增益", description: "进入音响模型前的电平校正。" },
  outputTrim: { cn: "输出增益", description: "最终输出电平校正。" },
  mix: { cn: "干湿比例", description: "原始信号与旋转空间处理的混合比例。" },
  bypass: { cn: "旁路", description: "暂时绕过全部处理，保留输入电平路径。" },
  quality: { cn: "处理质量", description: "Live 低延迟；Studio 使用更精细的空间处理。" },
  model: { cn: "音箱模型", description: "选择一条经过设计的音响频响与箱体性格。" },
  modelBypass: { cn: "音箱旁路", description: "关闭音箱染色，只保留后续旋转与空间效果。" },
  drive: { cn: "驱动", description: "增加箱体前级的饱和与动态密度。" },
  resonance: { cn: "箱体共振", description: "增强箱体低中频的共鸣感。" },
  damping: { cn: "箱体阻尼", description: "控制共振衰减速度与边缘柔和度。" },
  loudnessMatch: { cn: "响度匹配", description: "切换模型时自动补偿感知响度。" },
  structure: { cn: "结构", description: "选择号角、鼓体与扩散结构的几何声学组合。" },
  feedMode: { cn: "馈送模式", description: "决定左右声道如何驱动两个转子。" },
  renderMode: { cn: "渲染模式", description: "在双声道扬声器与双耳近似之间选择输出方式。" },
  speedMode: { cn: "转速模式", description: "停止、慢速、快速、自由速率或宿主同步。" },
  freeRate: { cn: "自由转速", description: "自由模式下的目标转速，向上拖动更快。" },
  syncDivision: { cn: "同步分频", description: "宿主 BPM 下每圈对应的音乐时值。" },
  inertia: { cn: "惯性", description: "转速改变的平滑时间，越大越像真实机械。" },
  direction: { cn: "方向", description: "切换顺时针与逆时针，反向会平滑穿越零速。" },
  depth: { cn: "转子深度", description: "控制转子运动对声像和距离感的影响。" },
  distance: { cn: "监听距离", description: "虚拟听者到音箱的距离。" },
  angle: { cn: "监听角度", description: "听者相对音箱中心轴的偏转角。" },
  earlyReflections: { cn: "早期反射", description: "增加房间早期反射，建立空间边界。" },
  roomDamping: { cn: "房间阻尼", description: "控制反射高频的吸收速度。" },
  modelAmount: { cn: "模型量", description: "音箱频响与箱体染色的强度。" },
  rotatorAmount: { cn: "旋转量", description: "旋转带来的振幅与声像摆动强度。" },
  dopplerAmount: { cn: "多普勒量", description: "独立控制转子运动造成的频移与速度感。" },
  dreamBypass: { cn: "梦境旁路", description: "关闭 Dream 尾音与微移处理。" },
  predelay: { cn: "预延迟", description: "直达声到梦境尾音之间的时间间隔。" },
  predelaySync: { cn: "预延迟同步", description: "将预延迟锁定到宿主 BPM。" },
  diffusion: { cn: "扩散", description: "把回声打散成更连续、更柔和的声场。" },
  tail: { cn: "梦境尾音", description: "Dream 空间的衰减时长。" },
  microshift: { cn: "微移", description: "为尾音加入轻微左右音高偏移与宽度。" },
  dreamDamping: { cn: "梦境阻尼", description: "控制尾音高频的衰减。" },
  feedback: { cn: "反馈", description: "控制梦境延迟回授，越高越绵长。" },
  freeze: { cn: "冻结", description: "保持当前梦境尾音，持续生成悬浮声场。" },
  character: { cn: "性格", description: "调整 Dream 的颗粒、调制与音色个性。" },
  motion: { cn: "运动", description: "控制视觉与声场运动的活跃程度。" },
  space: { cn: "空间", description: "控制 Dream 声场的宽度与房间感。" },
  dream: { cn: "梦境", description: "Dream 效果的总强度。" },
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
  dopplerAmount: 1,
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
  dopplerAmount: { minimum: 0, maximum: 1 },
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
    dopplerAmount: readValue(state, "dopplerAmount", defaultPluginValues.dopplerAmount),
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
