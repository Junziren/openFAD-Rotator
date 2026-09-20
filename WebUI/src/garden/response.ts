import { defaultSpeakerProfiles } from "../parameterContract";
import type { SpeakerProfile } from "../nativeBridge";

// The same schematic voicing curve as the existing GUI, not a measured DSP EQ.
export function drawResponse(canvas: HTMLCanvasElement, model: number, profiles: readonly SpeakerProfile[] = defaultSpeakerProfiles) {
  const profile = profiles[model] ?? defaultSpeakerProfiles[model];
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const smooth = (v: number) => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };
  const db = (v: number) => 12 * Math.log10(Math.max(.01, v));
  const left = 27, right = w - 5, top = 8, bottom = h - 8;
  const plotH = bottom - top;
  const style = document.body.dataset.renderStyle ?? "original";
  const palettes = {
    original: { grid: "#d0d8d4", ink: "#596d63", line: "#b36760", fill: "#c571691a" },
    hologram: { grid: "#96bebc", ink: "#32676b", line: "#278f94", fill: "#46bcb326" },
    comic: { grid: "#bac0b8", ink: "#293c3d", line: "#293c3d", fill: "#788a7a25" },
    cel: { grid: "#b0c7b8", ink: "#405f50", line: "#377860", fill: "#86b69b55" },
  };
  const palette = palettes[style as keyof typeof palettes] ?? palettes.original;
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.font = "9px Consolas, monospace";
  ctx.fillStyle = palette.ink;
  for (const [fraction, label] of [[0, "+4"], [.5, "0"], [1, "-4"]] as const) {
    const y = top + plotH * fraction;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.fillText(label, 1, y + 3);
  }
  for (const x of [.25, .5, .75]) {
    ctx.beginPath(); ctx.moveTo(left + (right - left) * x, top); ctx.lineTo(left + (right - left) * x, bottom); ctx.stroke();
  }
  ctx.beginPath();
  const points: number[] = [];
  for (let i = 0; i < 40; i++) {
    const x = i / 39;
    const low = db(profile.lowGain), body = db(profile.lowMidGain), mid = db(profile.midGain);
    const presence = db(profile.presenceGain), high = db(profile.highGain), air = db(profile.highGain * profile.airGain);
    const value = low
      + (body - low) * smooth((x - (.08 + profile.lowCut * 1.8 - .12)) / .2)
      + (mid - body) * smooth((x - (.26 + profile.lowCut * .8 - .1)) / .2)
      + (presence - mid) * smooth((x - (.46 + profile.highCut * .12 - .1)) / .22)
      + (air - high) * smooth((x - (.68 + profile.highCut * .16 - .12)) / .24);
    const py = top + plotH / 2 - Math.min(1, Math.max(-1, value / 4)) * plotH / 2;
    points.push(value);
    if (!i) ctx.moveTo(left, py); else ctx.lineTo(left + x * (right - left), py);
  }
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = style === "comic" ? 2.8 : 2.4;
  if (style === "hologram") {
    ctx.shadowColor = "#49cfc4";
    ctx.shadowBlur = 5;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.closePath();
  ctx.fillStyle = palette.fill; ctx.fill();
  if (style === "comic" || style === "hologram") {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = style === "comic" ? "#63776a55" : "#68b7b42e";
    ctx.lineWidth = .6;
    const spacing = style === "comic" ? 8 : 5;
    for (let y = top - w; y < bottom; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, style === "comic" ? y + w : y);
      ctx.stroke();
    }
    ctx.restore();
  }
  canvas.dataset.renderStyle = style;
  canvas.dataset.profile = profile.id;
  canvas.dataset.curve = points.map(p => p.toFixed(2)).join(",");
  canvas.setAttribute("aria-label", `${profile.name} 音箱频率响应曲线，模型示意，纵轴相对 dB`);
}
