import {
  defaultPluginValues, parameterHelp, modelOptions, structureOptions,
  feedModeOptions, renderModeOptions, speedModeOptions, syncDivisionOptions,
  qualityOptions, type PluginValues,
} from "../parameterContract";

export type Id = Exclude<keyof PluginValues, "bpm">;
export type Control = { id: Id; min: number; max: number; step: number; unit?: string; log?: boolean };
const c = (id: Id, min = 0, max = 1, step = .01, unit = "%", log = false): Control =>
  ({ id, min, max, step, unit, log });
export const macros = ["character", "motion", "space", "dream"] as const;
export const names: Partial<Record<Id, string>> = { character: "音色", motion: "运动", space: "空间", dream: "梦境" };
export const title = (id: Id) => names[id] ?? parameterHelp[id]?.cn ?? id;
export const colors = ["#c57169", "#699b89", "#659cae", "#c6a251", "#8484a4", "#778681"];
export const groups = [
  { name: "音箱", en: "SPEAKER", macro: "character", controls: [c("modelAmount"), c("drive"), c("resonance"), c("damping")], options: ["model", "modelBypass", "loudnessMatch"] },
  { name: "旋转", en: "ROTATION", macro: "motion", controls: [c("freeRate", .02, 20, .01, "Hz", true), c("inertia", .05, 12, .01, "s"), c("rotatorAmount"), c("depth")], options: ["speedMode", "syncDivision", "direction", "structure"] },
  { name: "空间", en: "SPACE", macro: "space", controls: [c("distance", .5, 3, .01, "m"), c("angle", -45, 45, .1, "°"), c("earlyReflections"), c("roomDamping")], options: ["feedMode", "renderMode"] },
  { name: "梦境", en: "DREAM", macro: "dream", controls: [c("predelay", 0, .25, .001, "s"), c("diffusion"), c("tail", .2, 12, .01, "s", true), c("microshift", 0, 25, .01, "ct"), c("dreamDamping"), c("feedback", 0, .96)], options: ["dreamBypass", "predelaySync", "freeze"] },
  { name: "多普勒", en: "DOPPLER", macro: "", controls: [c("dopplerAmount")], options: [] },
  { name: "输出", en: "OUTPUT", macro: "", controls: [c("inputTrim", -24, 24, .1, "dB"), c("mix"), c("outputTrim", -24, 12, .1, "dB")], options: ["quality", "bypass"] },
] as const;
export const choices: Partial<Record<Id, readonly string[]>> = {
  model: modelOptions, structure: structureOptions, feedMode: feedModeOptions,
  renderMode: renderModeOptions, speedMode: speedModeOptions, syncDivision: syncDivisionOptions,
  quality: qualityOptions, direction: ["CW", "CCW"],
};
export const controls: Control[] = [...macros.map(id => c(id)), ...groups.flatMap(g => [...g.controls])];
export const definitions = new Map(controls.map(control => [control.id, control]));
export const defaults = { ...defaultPluginValues };
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function ratio(id: Id, value: number) {
  const d = definitions.get(id)!;
  return d.log ? Math.log(value / d.min) / Math.log(d.max / d.min) : (value - d.min) / (d.max - d.min);
}
export function fromRatio(id: Id, r: number) {
  const d = definitions.get(id)!;
  const value = d.log ? d.min * (d.max / d.min) ** clamp(r) : d.min + clamp(r) * (d.max - d.min);
  return clamp(Number((Math.round(value / d.step) * d.step).toFixed(6)), d.min, d.max);
}
export function format(id: Id, value: number | boolean) {
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (choices[id]) return choices[id]![value];
  const d = definitions.get(id)!;
  return d.unit === "%" ? `${Math.round(value * 100)}%` :
    `${value.toFixed(d.step < .005 ? 3 : d.step < .05 ? 2 : 1)} ${d.unit}`;
}
export function disabled(id: Id, values: PluginValues) {
  return (id === "freeRate" && values.speedMode !== 3) || (id === "syncDivision" && values.speedMode !== 4);
}
