import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createIcons, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Activity, X, ExternalLink } from "lucide";
import { defaultSpeakerProfiles, normalisedForParameter, parsePluginValues } from "../parameterContract";
import { NativeBridge, type NativeState, type NativeTelemetry, type SpeakerProfile } from "../nativeBridge";
import { choices, clamp, colors, controls, defaults, definitions, disabled, format, fromRatio, groups, macros, ratio, title, type Id } from "./parameters";
import "./style.css";
import { VisualStyles, RotorEffects, type RenderStyle } from "./visuals";
import { drawResponse } from "./response";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const values = { ...defaults };
let selectedGroup = 0;
let expanded = true;
let ready = false;
let reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let aboutOpen = false;
let aboutReturnFocus: HTMLElement | null = null;
let raf = 0;
let previousTime = 0;
let frameCount = 0;
let connected = false;
let bridge: NativeBridge | undefined;
let profiles: readonly SpeakerProfile[] = defaultSpeakerProfiles;
let telemetry: NativeTelemetry = {};
let telemetryTime = -Infinity;
let lastAudioSequence = -1;
let hornOffset = 0, drumOffset = 0;
let presetModified = false;
let presetName = "";
let programIndex = 0;
let presetRevision = -1;
const nativeDefaults = new Map<Id, number | boolean>();
const presetBaseline = new Map<string, number>();
let bankDirty = true;
let hostVisible = true;
const roots = new Map<Id, THREE.Object3D>();
const movers: THREE.Object3D[] = [];
const labels = new Map<Id, HTMLElement>();
const anchors = new Map<Id, THREE.Vector3>();
let horn: THREE.Object3D | undefined, drum: THREE.Object3D | undefined;
let activeDrag: { id: Id; pointer: number; element: HTMLElement; last: number; before: number } | undefined;
let hovered: Id | undefined;
const assetUrl = "./models/acoustic-garden.glb";
const markUrl = "./unpure-bloom-mark.svg";

$("#app").innerHTML = `
  <header>
    <button class="identity brand-button" id="brand" aria-label="关于 openFAD Rotator" aria-haspopup="dialog" aria-controls="about" aria-expanded="false" title="关于 openFAD Rotator"><img src="${markUrl}" alt=""><span class="brand-title"><strong>openFAD Rotator</strong><small>UNPURE BLOOM / AUDIO INSTRUMENTS</small></span></button>
    <div class="header-actions">
      <div class="preset-bar" aria-label="预设">
        <button class="icon native-control" id="preset-prev" disabled title="上一个工厂预设" aria-label="上一个工厂预设">${icon("chevron-left")}</button>
        <select id="preset-select" class="native-control" aria-label="预设" disabled><option value="-1">未连接</option></select>
        <button class="icon native-control" id="preset-next" disabled title="下一个工厂预设" aria-label="下一个工厂预设">${icon("chevron-right")}</button>
        <select id="preset-action" class="native-control" aria-label="预设文件操作" disabled><option value="">文件</option><option value="save">另存为…</option><option value="open">载入…</option></select>
      </div>
      <div class="size-picker" role="group" aria-label="界面尺寸">${["S", "M", "L"].map((s, i) => `<button data-size="${s}" aria-label="${["小", "中", "大"][i]}界面" title="${["小", "中", "大"][i]}界面" aria-pressed="${s === "M"}">${s}</button>`).join("")}</div>
      <button class="icon" id="reduce-motion" title="减少动态效果" aria-label="减少动态效果" aria-pressed="${reducedMotion}">${icon("activity")}</button>
    </div>
  </header>
  <section id="stage" aria-label="声学园林">
    <canvas id="garden" aria-label="可拖动的建筑场景"></canvas>
    <div class="stage-corner visual-tools">
      <label>渲染 <select id="render-style" aria-label="渲染风格"><option value="original">原色</option><option value="hologram">全息</option><option value="comic">漫画</option><option value="cel">赛璐璐</option></select></label>
      <label><input id="effects-enabled" type="checkbox" checked>特效</label>
      <select id="effects-mode" aria-label="特效组合"><option value="combined">融合</option><option value="legacy">经典轨迹</option><option value="spatial">空间波纹</option></select>
      <input id="effects-strength" type="range" min="0" max="1" step=".05" value=".65" aria-label="特效强度" title="特效强度">
    </div>
    <div id="loading" role="status">正在载入园林…</div>
    <div id="notice" role="status" hidden></div>
  </section>
  <section id="bank" aria-label="细节参数">
    <div class="bank-head">
      <nav role="tablist" aria-label="参数分组">${groups.map((g, i) => `<button id="tab-${i}" role="tab" aria-controls="bank-content" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-group="${i}"><small>0${i + 1}</small>${g.name}</button>`).join("")}</nav>
      <button class="icon" id="collapse" title="收起 / 展开细节参数" aria-label="收起细节参数" aria-expanded="true">${icon("chevron-down")}</button>
    </div>
    <div id="bank-content" role="tabpanel" aria-labelledby="tab-0">
      <div id="options"></div>
      <div id="control-deck">
        <section id="response" aria-label="音箱频率响应曲线"><div><strong>音箱频率响应曲线</strong><span title="模型特性示意，并非实测传递函数">模型特性</span></div><canvas id="response-curve" role="img"></canvas><div class="response-axis"><span>20 Hz</span><span>1 kHz</span><span>20 kHz</span></div></section>
        <div id="columns"><canvas id="pillar-canvas" aria-hidden="true"></canvas><div id="column-ui"></div></div>
      </div>
    </div>
  </section>
  <footer><span id="status" role="status">正在连接…</span><span id="rotor-status">—</span></footer>
`;
document.body.insertAdjacentHTML("beforeend", `
  <dialog id="about" aria-labelledby="about-title">
    <button class="icon about-close" id="about-close" aria-label="关闭 About" title="关闭">${icon("x")}</button>
    <div class="about-identity"><img src="${markUrl}" alt=""><div><p>UNPURE BLOOM / AUDIO INSTRUMENTS</p><h1 id="about-title">openFAD Rotator</h1><span>ROTARY SPEAKER / DOPPLER / DREAM</span></div></div>
    <p class="about-description">一台专注于旋转音箱的空间效果器：原创音箱性格、惯性双转子、多普勒频移与 Dream 尾音。</p>
    <dl class="about-details"><div><dt>发行商</dt><dd>Unpure Bloom</dd></div><div><dt>产品版本</dt><dd>0.1.0</dd></div><div><dt>界面</dt><dd>Acoustic Garden</dd></div><div><dt>状态</dt><dd id="about-state">未连接</dd></div></dl>
    <div class="about-links">
      <a href="https://github.com/Junziren" target="_blank" rel="noopener noreferrer"><span>作者</span><strong>Junziren</strong>${icon("external-link")}</a>
      <a href="https://github.com/Junziren/openFAD-Rotator" target="_blank" rel="noopener noreferrer"><span>项目</span><strong>openFAD Rotator</strong>${icon("external-link")}</a>
      <a href="https://fadrecords.com/openfad/" target="_blank" rel="noopener noreferrer"><span>企划</span><strong>openFAD</strong>${icon("external-link")}</a>
    </div>
  </dialog>
`);
function openAbout() {
  if (aboutOpen) return;
  endDrag();
  aboutReturnFocus = document.activeElement as HTMLElement;
  aboutOpen = true;
  $("#brand").setAttribute("aria-expanded", "true");
  $("#brand").classList.add("turning");
  $<HTMLDialogElement>("#about").showModal();
  $("#about-close").focus();
  cancelAnimationFrame(raf);
  raf = 0;
}
function closeAbout() { $<HTMLDialogElement>("#about").close(); }
$("#brand").addEventListener("click", openAbout);
$("#about-close").addEventListener("click", closeAbout);
$("#about").addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  const items = [...$("#about").querySelectorAll<HTMLElement>("button,a[href]")];
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$("#about").addEventListener("click", event => {
  const r = $("#about").getBoundingClientRect();
  if (event.target === $("#about") && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) closeAbout();
});
$("#about").addEventListener("close", () => {
  aboutOpen = false;
  $("#brand").setAttribute("aria-expanded", "false");
  $("#brand").classList.remove("turning");
  aboutReturnFocus?.focus();
  previousTime = 0;
  requestRender();
});
$("#reduce-motion").addEventListener("click", () => {
  reducedMotion = !reducedMotion;
  document.body.classList.toggle("reduced-motion", reducedMotion);
  $("#reduce-motion").setAttribute("aria-pressed", String(reducedMotion));
  updateValues();
});
document.body.classList.toggle("reduced-motion", reducedMotion);
document.querySelectorAll<HTMLElement>("[data-size]").forEach(button => button.addEventListener("click", () => {
  document.body.dataset.uiSize = button.dataset.size;
  document.querySelectorAll<HTMLElement>("[data-size]").forEach(el => el.setAttribute("aria-pressed", String(el === button)));
  resize();
}));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#efefef");
const camera = new THREE.OrthographicCamera(-7, 7, 5, -5, .1, 100);
camera.position.set(18, 18.65, 18);
camera.lookAt(0, .65, 0);
const renderer = new THREE.WebGLRenderer({ canvas: $("#garden"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
function lights(target: THREE.Scene) {
  target.add(new THREE.HemisphereLight("#ffffff", "#a3b3ad", 2.6));
  const key = new THREE.DirectionalLight("#fff9ef", 3.2);
  key.position.set(-3, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -10;
  key.shadow.camera.right = key.shadow.camera.top = 10;
  key.shadow.normalBias = .025;
  key.shadow.bias = -.00015;
  key.shadow.radius = 3;
  target.add(key);
  const fill = new THREE.DirectionalLight("#e8f0ff", 1);
  fill.position.set(6, 5, -5);
  target.add(fill);
}
lights(scene);
const bankScene = new THREE.Scene();
bankScene.background = new THREE.Color("#e7eae6");
lights(bankScene);
const bankCamera = new THREE.OrthographicCamera(-6, 6, 2, -2, .1, 60);
bankCamera.position.set(0, 7, 11);
bankCamera.lookAt(0, .8, 0);
const bankRenderer = new THREE.WebGLRenderer({ canvas: $("#pillar-canvas"), antialias: true });
bankRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
bankRenderer.shadowMap.enabled = true;
bankRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
bankRenderer.toneMapping = THREE.ACESFilmicToneMapping;
bankRenderer.toneMappingExposure = 1.18;
const pillars = new Map<Id, { group: THREE.Group; shaft: THREE.Mesh; head: THREE.Mesh }>();
const pillarGeo = new THREE.BoxGeometry(1, 1, 1);
const neutral = new THREE.MeshStandardMaterial({ color: "#d4ddd3", roughness: .85 });
const inset = new THREE.MeshStandardMaterial({ color: "#8d9e93", roughness: .9 });
const capMaterials = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: .7 }));
function box(parent: THREE.Object3D, size: number[], position: number[], mat: THREE.Material) {
  const mesh = new THREE.Mesh(pillarGeo, mat);
  mesh.scale.set(...size as [number, number, number]);
  mesh.position.set(...position as [number, number, number]);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const bankFloor = box(bankScene, [80, .06, 10], [0, -.13, 0], neutral);
bankFloor.receiveShadow = true;
const visualStyles = new VisualStyles();
const effects = new RotorEffects(scene);
function changeStyle() {
  const style = $<HTMLSelectElement>("#render-style").value as RenderStyle;
  document.body.dataset.renderStyle = style;
  if (ready) visualStyles.apply(asset, style);
  visualStyles.apply(bankScene, style);
  if (selectedGroup === 0 && expanded) drawResponse($("#response-curve"), values.model, profiles);
  scene.background = new THREE.Color(style === "hologram" ? "#dae8e7" : style === "comic" ? "#f3f2ee" : "#efefef");
  bankDirty = true;
  requestRender();
}
$("#render-style").addEventListener("change", changeStyle);
$("#effects-enabled").addEventListener("change", () => {
  effects.enabled = $<HTMLInputElement>("#effects-enabled").checked;
  requestRender();
});
$("#effects-mode").addEventListener("change", () => {
  effects.mode = $<HTMLSelectElement>("#effects-mode").value as "combined" | "legacy" | "spatial";
  requestRender();
});
$("#effects-strength").addEventListener("input", () => {
  effects.strength = Number($<HTMLInputElement>("#effects-strength").value);
  requestRender();
});

function iconsRefresh() { createIcons({ icons: { SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Activity, X, ExternalLink }, attrs: { "stroke-width": 1.5 } }); }
function notify(text: string) {
  $("#status").textContent = text;
}
function setValue(id: Id, value: number | boolean) {
  if (!connected) return;
  if (typeof defaults[id] === "boolean") value = Boolean(value);
  else if (choices[id]) value = Math.round(clamp(Number(value), 0, choices[id]!.length - 1));
  else {
    const d = definitions.get(id)!;
    value = clamp(Number(value), d.min, d.max);
  }
  if (typeof value === "number" && !Number.isFinite(value)) return;
  const normalized = normalisedForParameter(id, value);
  if (!activeDrag) bridge?.parameterGesture(id, "begin", normalisedForParameter(id, values[id]));
  Object.assign(values, { [id]: value });
  bridge?.parameterGesture(id, "set", normalized);
  if (!activeDrag) bridge?.parameterGesture(id, "end", normalized);
  if (roots.has(id) && !reducedMotion) effects.pulse(roots.get(id)!);
  presetModified = true;
  refreshPresetLabel();
  updateValues();
  notify(`${title(id)}  ${format(id, value)}`);
}
function updateValues() {
  movers.forEach(node => {
    const d = node.userData;
    const axis = d.transform_axis_blender === "Z" ? "y" : d.transform_axis_blender === "Y" ? "z" : "x";
    const target = d.transform_property === "scale" ? node.scale : node.position;
    const sign = d.transform_property === "location" && d.transform_axis_blender === "Y" ? -1 : 1;
    target[axis] = sign * (d.low + (d.high - d.low) * Number(values[d.control_id as Id]));
  });
  document.querySelectorAll<HTMLElement>("[data-param]").forEach(el => {
    const id = el.dataset.param as Id;
    const value = values[id];
    const isDisabled = !connected || disabled(id, values);
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox") el.checked = Boolean(value);
      else if (document.activeElement !== el) {
        const percent = definitions.get(id)?.unit === "%";
        el.value = String(percent ? Number((Number(value) * 100).toFixed(2)) : Number(Number(value).toFixed(3)));
      }
      el.disabled = isDisabled;
    } else if (el instanceof HTMLSelectElement) {
      el.value = String(value);
      el.disabled = isDisabled;
    } else if (el.getAttribute("role") === "slider") {
      el.setAttribute("aria-valuenow", String(value));
      el.setAttribute("aria-valuetext", format(id, value));
      el.setAttribute("aria-disabled", String(isDisabled));
      el.tabIndex = isDisabled ? -1 : 0;
    }
  });
  pillars.forEach(({ shaft, head, group }, id) => {
    const height = .22 + ratio(id, Number(values[id])) * 1.13;
    shaft.scale.y = height;
    shaft.position.y = .16 + height / 2;
    head.position.y = .19 + height;
    group.visible = true;
    $(`[data-column="${id}"]`).classList.toggle("disabled", !connected || disabled(id, values));
  });
  bankDirty = true;
  if (selectedGroup === 0) drawResponse($("#response-curve"), values.model, profiles);
  requestRender();
}
function sliderAttributes(id: Id) {
  const d = definitions.get(id)!;
  return `role="slider" tabindex="0" aria-label="${title(id)}" aria-valuemin="${d.min}" aria-valuemax="${d.max}" aria-valuenow="${values[id]}" aria-orientation="${id === "space" ? "horizontal" : "vertical"}" data-param="${id}"`;
}
function numeric(id: Id) {
  const d = definitions.get(id)!;
  const scale = d.unit === "%" ? 100 : 1;
  return `<input type="number" data-param="${id}" aria-label="${title(id)}数值" min="${d.min * scale}" max="${d.max * scale}" step="${d.step * scale}" autocomplete="off" spellcheck="false"><span class="unit">${d.unit}</span>`;
}
macros.forEach((id, i) => {
  const el = document.createElement("div");
  el.className = "macro";
  el.style.setProperty("--color", colors[i]);
  el.dataset.macro = id;
  el.innerHTML = `<div class="macro-handle" ${sliderAttributes(id)} title="${title(id)} · 拖动调节 / Shift 细调 / 双击复位"><span>0${i + 1}</span>${title(id)}</div><div class="value-line">${numeric(id)}</div><button title="展开${title(id)}细节" aria-label="展开${title(id)}细节">${icon("sliders-horizontal")}</button>`;
  $("#stage").append(el);
  el.querySelector("button")!.addEventListener("click", () => selectGroup(i, true));
  labels.set(id, el);
});
function createBank() {
  const g = groups[selectedGroup];
  document.documentElement.style.setProperty("--accent", colors[selectedGroup]);
  $("#bank-content").setAttribute("aria-labelledby", `tab-${selectedGroup}`);
  document.querySelectorAll<HTMLElement>("[data-group]").forEach(el => {
    const active = Number(el.dataset.group) === selectedGroup;
    el.setAttribute("aria-selected", String(active));
    el.tabIndex = active ? 0 : -1;
  });
  labels.forEach((el, id) => el.classList.toggle("active", g.macro === id));
  $("#options").innerHTML = g.options.map(key => {
    const id = key as Id;
    return choices[id] ?
      `<label class="option"><span>${title(id)}</span><select data-param="${id}" aria-label="${title(id)}">${choices[id]!.map((v, i) => `<option value="${i}">${v}</option>`).join("")}</select></label>` :
      `<label class="option"><input type="checkbox" data-param="${id}"><span>${title(id)}</span></label>`;
  }).join("");
  $("#options").style.display = g.options.length ? "flex" : "none";
  $("#response").hidden = selectedGroup !== 0;
  $("#control-deck").classList.toggle("with-response", selectedGroup === 0);
  pillars.forEach(({ group }) => { visualStyles.release(group); bankScene.remove(group); });
  pillars.clear();
  $("#column-ui").innerHTML = g.controls.map(d => `<div class="column" data-column="${d.id}"><div class="pull" ${sliderAttributes(d.id)} title="${title(d.id)} · 上拉增加 / 下推减少 / Shift 细调 / 双击复位"></div><span class="caption">${title(d.id)}</span><div class="readout">${numeric(d.id)}</div></div>`).join("");
  g.controls.forEach(d => {
    const group = new THREE.Group();
    bankScene.add(group);
    box(group, [.94, .13, .76], [0, .015, 0], neutral);
    box(group, [.62, .06, .47], [0, .10, 0], inset);
    const shaft = box(group, [.44, .8, .34], [0, .5, 0], capMaterials[selectedGroup]);
    const head = box(group, [.71, .15, .56], [0, 1, 0], capMaterials[selectedGroup]);
    // Recessed marks on the back rail make the pull travel readable at a glance.
    box(group, [.10, 1.6, .09], [.48, .77, -.18], neutral);
    for (let i = 0; i < 6; i++) box(group, [.16, .018, .022], [.46, .17 + i * .26, -.115], inset);
    box(head, [.54, .06, .045], [0, .52, .10], neutral);
    pillars.set(d.id, { group, shaft, head });
  });
  bindControls($("#bank-content"));
  visualStyles.apply(bankScene, visualStyles.style);
  updateValues();
  resize();
}
function selectGroup(index: number, open = expanded) {
  endDrag();
  selectedGroup = index;
  expanded = open;
  $("#bank-content").hidden = !expanded;
  $("#collapse").setAttribute("aria-expanded", String(expanded));
  $("#collapse").setAttribute("aria-label", expanded ? "收起细节参数" : "展开细节参数");
  $("#collapse").innerHTML = icon(expanded ? "chevron-down" : "chevron-up");
  createBank();
  iconsRefresh();
}
function changeRatio(id: Id, delta: number) { setValue(id, fromRatio(id, ratio(id, Number(values[id])) + delta)); }
function startDrag(event: PointerEvent, id: Id, element: HTMLElement) {
  if (!connected || event.button !== 0 || disabled(id, values) || activeDrag) return;
  event.preventDefault();
  element.focus({ preventScroll: true });
  activeDrag = { id, pointer: event.pointerId, element, last: id === "space" ? event.clientX : event.clientY, before: Number(values[id]) };
  bridge?.parameterGesture(id, "begin", normalisedForParameter(id, values[id]));
  element.setPointerCapture(event.pointerId);
  element.style.cursor = id === "space" ? "ew-resize" : "ns-resize";
}
function endDrag() {
  if (!activeDrag) return;
  const { element, pointer, id } = activeDrag;
  bridge?.parameterGesture(id, "end", normalisedForParameter(id, values[id]));
  activeDrag = undefined;
  if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
  element.style.cursor = "";
}
window.addEventListener("pointermove", event => {
  if (!activeDrag || activeDrag.pointer !== event.pointerId) return;
  const pos = activeDrag.id === "space" ? event.clientX : event.clientY;
  const delta = (pos - activeDrag.last) * (activeDrag.id === "space" ? 1 : -1);
  activeDrag.last = pos;
  changeRatio(activeDrag.id, delta / (event.shiftKey ? 1200 : 240));
});
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
window.addEventListener("blur", endDrag);
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && activeDrag) {
    setValue(activeDrag.id, activeDrag.before);
    endDrag();
  }
});
function bindControls(parent: HTMLElement) {
  parent.querySelectorAll<HTMLElement>('[role="slider"]').forEach(el => {
    const id = el.dataset.param as Id;
    el.addEventListener("pointerdown", event => startDrag(event, id, el));
    el.addEventListener("lostpointercapture", endDrag);
    el.addEventListener("dblclick", () => { if (!disabled(id, values)) setValue(id, nativeDefaults.get(id) ?? defaults[id]); });
    el.addEventListener("wheel", event => {
      if (disabled(id, values)) return;
      event.preventDefault();
      changeRatio(id, Math.sign(-event.deltaY) * (event.shiftKey ? .0025 : .01));
    }, { passive: false });
    el.addEventListener("keydown", event => {
      if (disabled(id, values)) return;
      if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "Home" || event.key === "End") setValue(id, event.key === "Home" ? definitions.get(id)!.min : definitions.get(id)!.max);
        else changeRatio(id, (["ArrowUp", "ArrowRight", "PageUp"].includes(event.key) ? 1 : -1) * (event.key.startsWith("Page") ? .1 : event.shiftKey ? .0025 : .01));
      }
    });
  });
  parent.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[data-param],select[data-param]").forEach(el => {
    el.addEventListener("change", () => {
      const id = el.dataset.param as Id;
      if (el instanceof HTMLInputElement && el.type === "checkbox") setValue(id, el.checked);
      else {
        const value = Number(el.value) / (definitions.get(id)?.unit === "%" ? 100 : 1);
        if (el.value !== "" && Number.isFinite(value)) setValue(id, value);
      }
      el.blur();
      updateValues();
    });
    el.addEventListener("keydown", event => {
      if ((event as KeyboardEvent).key === "Enter") el.blur();
      if ((event as KeyboardEvent).key === "Escape") {
        const id = el.dataset.param as Id;
        el.value = String(Number(values[id]) * (definitions.get(id)?.unit === "%" ? 100 : 1));
        el.blur(); updateValues();
      }
    });
  });
}
bindControls($("#stage"));
document.querySelectorAll<HTMLElement>("[data-group]").forEach(el => {
  el.addEventListener("click", () => selectGroup(Number(el.dataset.group), true));
  el.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : (selectedGroup + (event.key === "ArrowRight" ? 1 : -1) + groups.length) % groups.length;
    selectGroup(next, true);
    $(`#tab-${next}`).focus();
  });
});
$("#collapse").addEventListener("click", () => selectGroup(selectedGroup, !expanded));
function refreshPresetLabel() {
  const select = $<HTMLSelectElement>("#preset-select");
  const current = select.querySelector<HTMLOptionElement>('option[value="-1"]');
  if (current) current.textContent = `${presetName || "未连接"}${presetModified ? " *" : ""}`;
  select.value = "-1";
}
function receiveState(state: NativeState) {
  const first = !connected;
  connected = true;
  const presetChanged = first || presetName !== state.programName || programIndex !== state.program || presetRevision !== state.presetRevision;
  if (presetChanged) {
    // A preset/state replacement cancels capture without replaying the old value.
    if (activeDrag) endDrag();
    presetBaseline.clear();
    presetModified = false;
  }
  const next = parsePluginValues(state);
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    if (activeDrag?.id !== key) Object.assign(values, { [key]: next[key] });
  }
  if (state.speakerProfiles?.length) profiles = state.speakerProfiles;
  const defaultState = { ...state, parameters: state.parameters?.map(row => ({ ...row, value: row.default ?? row.value })) };
  const defaultsFromHost = parsePluginValues(defaultState);
  for (const row of state.parameters ?? []) {
    nativeDefaults.set(row.id as Id, defaultsFromHost[row.id as Id]);
    if (presetChanged) presetBaseline.set(row.id, row.value);
    else if (Math.abs(row.value - (presetBaseline.get(row.id) ?? row.value)) > .000001) presetModified = true;
  }
  presetName = state.programName ?? "";
  programIndex = state.program ?? 0;
  presetRevision = state.presetRevision ?? 0;
  const select = $<HTMLSelectElement>("#preset-select");
  const names = state.programNames ?? [];
  if (select.dataset.names !== JSON.stringify(names)) {
    select.replaceChildren(new Option(presetName, "-1"), ...names.map((name, i) => new Option(name, String(i))));
    select.dataset.names = JSON.stringify(names);
  }
  refreshPresetLabel();
  document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(".native-control").forEach(el => el.disabled = false);
  $("#about-state").textContent = "VST3 / 原生音频引擎";
  if (first) notify("就绪");
  updateValues();
}
function receiveTelemetry(frame: NativeTelemetry) {
  telemetry = frame;
  if (frame.audioSequence !== lastAudioSequence) {
    telemetryTime = performance.now();
    lastAudioSequence = frame.audioSequence ?? -1;
  }
  values.bpm = frame.bpm ?? values.bpm;
  $("#rotor-status").textContent = `${(frame.rotorRate ?? 0).toFixed(2)} Hz · ${values.bpm.toFixed(1)} BPM`;
  requestRender();
}
$("#preset-prev").addEventListener("click", () => { endDrag(); bridge?.previousProgram(); });
$("#preset-next").addEventListener("click", () => { endDrag(); bridge?.nextProgram(); });
$("#preset-select").addEventListener("change", () => {
  endDrag();
  const index = Number($<HTMLSelectElement>("#preset-select").value);
  if (index >= 0) bridge?.program(index);
});
$("#preset-action").addEventListener("change", () => {
  endDrag();
  const menu = $<HTMLSelectElement>("#preset-action");
  if (menu.value === "save") bridge?.savePreset();
  if (menu.value === "open") bridge?.openPreset();
  menu.value = "";
});
$("#about").querySelectorAll<HTMLAnchorElement>("a").forEach(link => link.addEventListener("click", event => {
  event.preventDefault();
  bridge?.openExternal(link.href);
}));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(event: PointerEvent | MouseEvent) {
  const rect = $("#garden").getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([...roots.values()], true)[0];
  let node: THREE.Object3D | null | undefined = hit?.object;
  while (node) {
    if (node.userData.control_id) return node.userData.control_id as Id;
    node = node.parent;
  }
}
const outline = new THREE.BoxHelper(new THREE.Object3D(), "#617771");
outline.visible = false;
outline.material.depthTest = false;
outline.material.transparent = true;
outline.material.opacity = .38;
scene.add(outline);
$("#garden").addEventListener("pointerdown", event => {
  const id = pick(event);
  if (id) startDrag(event, id, $("#garden"));
});
$("#garden").addEventListener("lostpointercapture", endDrag);
$("#garden").addEventListener("pointermove", event => {
  if (activeDrag) return;
  hovered = pick(event);
  $("#garden").style.cursor = hovered ? hovered === "space" ? "ew-resize" : "ns-resize" : "default";
  outline.visible = Boolean(hovered);
  if (hovered) outline.setFromObject(roots.get(hovered)!);
  requestRender();
});
$("#garden").addEventListener("pointerleave", () => { hovered = undefined; outline.visible = false; requestRender(); });
$("#garden").addEventListener("dblclick", event => { const id = pick(event); if (id) setValue(id, nativeDefaults.get(id) ?? defaults[id]); });
$("#garden").tabIndex = -1;

let asset: THREE.Object3D;
let sceneBox: THREE.Box3;
function fitCamera() {
  if (!sceneBox) return;
  camera.updateMatrixWorld(true);
  const inverse = camera.matrixWorldInverse;
  const points: THREE.Vector3[] = [];
  asset.updateMatrixWorld(true);
  asset.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).applyMatrix4(inverse));
    }
  });
  const bounds = new THREE.Box3().setFromPoints(points);
  const aspect = $("#stage").clientWidth / $("#stage").clientHeight;
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const viewHeight = Math.max(height * 1.23, width * (aspect < 1 ? 1.12 : 1.43) / aspect);
  const cx = (bounds.max.x + bounds.min.x) / 2;
  const cy = (bounds.max.y + bounds.min.y) / 2;
  camera.left = cx - viewHeight * aspect / 2;
  camera.right = cx + viewHeight * aspect / 2;
  camera.top = cy + viewHeight / 2;
  camera.bottom = cy - viewHeight / 2;
  camera.updateProjectionMatrix();
}
function positionLabels() {
  const width = $("#stage").clientWidth, height = $("#stage").clientHeight;
  anchors.forEach((anchor, id) => {
    const el = labels.get(id)!;
    const compact = width < 600;
    const coordinates = compact
      ? { character: [.16, .20], motion: [.84, .20], space: [.19, .79], dream: [.81, .79] }
      : { character: [.19, .38], motion: [.81, .32], space: [.25, .76], dream: [.76, .76] };
    const [rx, ry] = coordinates[id as keyof typeof coordinates];
    const x = rx * width;
    const y = ry * height;
    el.style.left = `${clamp(x, el.offsetWidth / 2 + 5, width - el.offsetWidth / 2 - 5)}px`;
    el.style.top = `${clamp(y, 45, height - el.offsetHeight - 5)}px`;
  });
}
function resize() {
  renderer.setSize($("#stage").clientWidth, $("#stage").clientHeight, false);
  fitCamera();
  positionLabels();
  if (selectedGroup === 0 && expanded) drawResponse($("#response-curve"), values.model, profiles);
  if (expanded) {
    const w = $("#columns").clientWidth, h = $("#columns").clientHeight;
    bankRenderer.setSize(w, h, false);
    const units = 3.15;
    bankCamera.left = -units * w / h / 2;
    bankCamera.right = -bankCamera.left;
    bankCamera.top = units / 2;
    bankCamera.bottom = -units / 2;
    bankCamera.updateProjectionMatrix();
    bankCamera.updateMatrixWorld(true);
    const parent = $("#columns").getBoundingClientRect();
    pillars.forEach(({ group }, id) => {
      const el = $(`[data-column="${id}"]`).getBoundingClientRect();
      group.position.x = ((el.left + el.width / 2 - parent.left) / w - .5) * (bankCamera.right - bankCamera.left);
      const compact = w < 600;
      const scale = compact ? .60 : .82;
      group.scale.setScalar(scale);
      group.position.y = compact ? .43 : .43;
    });
  }
  bankDirty = true;
  requestRender();
}
new ResizeObserver(resize).observe($("#stage"));
new ResizeObserver(resize).observe($("#columns"));
function requestRender() {
  if (!raf && !document.hidden && !aboutOpen && hostVisible) raf = requestAnimationFrame(render);
}
function render(time: number) {
  raf = 0;
  if (document.hidden || aboutOpen || !hostVisible) return;
  const delta = previousTime ? Math.min((time - previousTime) / 1000, .05) : 0;
  previousTime = time;
  const fresh = connected && time - telemetryTime < 180;
  if (ready && fresh && !reducedMotion) {
    const ahead = Math.min(.075, Math.max(0, (time - telemetryTime) / 1000));
    if (horn) horn.rotation.y = hornOffset + (telemetry.rotorPhase ?? 0) + (telemetry.rotorSignedRate ?? 0) * ahead * Math.PI * 2;
    if (drum) drum.rotation.y = drumOffset + (telemetry.drumPhase ?? 0) + (telemetry.drumSignedRate ?? 0) * ahead * Math.PI * 2;
  }
  if (activeDrag && roots.has(activeDrag.id)) outline.setFromObject(roots.get(activeDrag.id)!);
  const bands = fresh ? (telemetry.bands ?? [0, 0, 0]).map(v => clamp(v * 18)) : [0, 0, 0];
  effects.update(reducedMotion ? 0 : delta, (telemetry.rotorSignedRate ?? 0) < 0 ? -1 : 1, values.dopplerAmount, values.motion, bands);
  renderer.render(scene, camera);
  if (expanded && bankDirty) { bankRenderer.render(bankScene, bankCamera); bankDirty = false; }
  frameCount++;
  if (ready && !reducedMotion && (fresh || effects.feedbackActive)) requestRender();
}
document.addEventListener("visibilitychange", () => {
  endDrag();
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
  else requestRender();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
  if (event.matches && !reducedMotion) $("#reduce-motion").click();
});
document.addEventListener("contextmenu", event => {
  if (!(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-param]");
    const id = element?.dataset.param ?? (event.target === $("#garden") ? pick(event) : undefined);
    if (id) { endDrag(); bridge?.parameterMenu(id); }
  }
});
$("#garden").addEventListener("webglcontextlost", event => {
  event.preventDefault();
  reducedMotion = true;
  $("#loading").hidden = false;
  $("#loading").textContent = "图形上下文已丢失，请刷新重试。";
});

createBank();
iconsRefresh();
new GLTFLoader().load(assetUrl, gltf => {
  asset = gltf.scene;
  scene.add(asset);
  asset.traverse(node => {
    if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
    if (node.userData.transform_property) movers.push(node);
    else if (node.userData.control_id) roots.set(node.userData.control_id, node);
    if (node.userData.role?.startsWith("upper rotor")) horn = node;
    if (node.userData.role?.startsWith("lower rotor")) drum = node;
  });
  sceneBox = new THREE.Box3().setFromObject(asset);
  roots.forEach((root, id) => {
    const box = new THREE.Box3().setFromObject(root);
    // Labels sit just beyond the front edge of each building's fixed footprint.
    const center = box.getCenter(new THREE.Vector3());
    center.y = .15;
    center.x += .65;
    center.z += .65;
    anchors.set(id, center);
  });
  ready = true;
  hornOffset = horn?.rotation.y ?? 0;
  drumOffset = drum?.rotation.y ?? 0;
  const cabinet = asset.getObjectByName("Leslieassembly") ?? asset.getObjectByName("Leslie.assembly");
  if (cabinet) effects.attach(cabinet);
  else asset.traverse(node => { if (node.userData.asset_id === "original-cutaway-rotary-cabinet") effects.attach(node); });
  changeStyle();
  $("#loading").hidden = true;
  updateValues();
  resize();
}, undefined, error => {
  $("#loading").textContent = `模型载入失败：${String(error)}`;
});

bridge = new NativeBridge(receiveState, receiveTelemetry, notice => {
  const payload = notice as { ok?: boolean; message?: string; presetSaved?: boolean; presetLoaded?: boolean };
  if (payload.presetSaved || payload.presetLoaded) {
    presetModified = false;
    presetBaseline.clear();
    for (const id of Object.keys(defaults) as Id[]) if (id !== ("bpm" as Id)) presetBaseline.set(id, normalisedForParameter(id, values[id]));
    refreshPresetLabel();
  }
  notify(payload.message ?? (payload.ok ? "完成" : "操作失败"));
}, visible => {
  endDrag();
  hostVisible = visible;
  if (!visible) { endDrag(); cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
  else { bridge?.connect(); requestRender(); }
});
bridge.connect();
if (!bridge.available) { notify("未连接音频引擎"); $("#about-state").textContent = "未连接"; }
window.addEventListener("pagehide", () => { endDrag(); bridge?.dispose(); cancelAnimationFrame(raf); raf = 0; });
for (const event of ["dragstart", "dragover", "drop"]) document.addEventListener(event, e => e.preventDefault());
document.addEventListener("keydown", event => {
  if (event.key === "F5" || event.key === "F12" || (event.ctrlKey || event.metaKey) && ["r", "+", "-", "0"].includes(event.key.toLowerCase()))
    event.preventDefault();
});
// Read-only diagnostics also support the native editor verification harness.
Object.defineProperty(window, "__garden", { value: {
  get ready() { return ready; },
  get values() { return { ...values }; },
  get frameCount() { return frameCount; },
  get connected() { return connected; },
  get aboutOpen() { return aboutOpen; },
  get reducedMotion() { return reducedMotion; },
  get selectedGroup() { return selectedGroup; },
  get renderStyle() { return visualStyles.style; },
  get effectsEnabled() { return effects.enabled; },
  get effectMode() { return effects.mode; },
  get macroNodes() { return movers.map(n => ({ id: n.userData.control_id, name: n.name, position: n.position.toArray(), scale: n.scale.toArray() })); },
  get targets() {
    return [...roots].map(([id, root]) => {
      const p = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()).project(camera);
      const rect = $("#garden").getBoundingClientRect();
      return { id, x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    });
  },
  get controlIds() { return [...controls.map(c => c.id), ...groups.flatMap(g => [...g.options])]; },
} });
