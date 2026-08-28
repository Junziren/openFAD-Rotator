import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AudioLines,
  Bookmark,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileAudio,
  FolderOpen,
  Info,
  Mic,
  Pause,
  Play,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AudioReactiveEngine, type AudioMode } from "./audio";
import { NativeBridge, type NativeState, type NativeTelemetry, type SpeakerProfile } from "./nativeBridge";
import {
  activeRotorRate,
  defaultSpeakerProfiles,
  defaultPluginValues,
  feedModeOptions,
  modelOptions,
  normalisedForParameter,
  parsePluginValues,
  parameterHelp,
  qualityOptions,
  renderModeOptions,
  speedModeOptions,
  structureOptions,
  syncDivisionOptions,
  type PluginValues,
} from "./parameterContract";
import { AcousticLabScene, type AudioFrame, type SceneControls } from "./scene";

type ParameterId = keyof PluginValues;

const aboutLinks = [
  {
    label: "作者 / AUTHOR",
    address: "github.com/Junziren",
    href: "https://github.com/Junziren",
  },
  {
    label: "项目 / PROJECT",
    address: "github.com/Junziren/openFAD-Rotator",
    href: "https://github.com/Junziren/openFAD-Rotator",
  },
  {
    label: "openFAD 企划 / INITIATIVE",
    address: "fadrecords.com/openfad",
    href: "https://fadrecords.com/openfad/",
  },
] as const;

function formatControlNumber(value: number, step: number) {
  if (step < 0.005) return value.toFixed(3);
  if (step < 0.05) return value.toFixed(2);
  if (step < 0.5) return value.toFixed(1);
  return value.toFixed(0);
}

function controlTip({
  label,
  id,
  value,
  minimum,
  maximum,
  step,
  suffix = "",
  option,
  description,
  interaction,
}: {
  label: string;
  id?: ParameterId;
  value?: number | boolean;
  minimum?: number;
  maximum?: number;
  step?: number;
  suffix?: string;
  option?: string;
  description?: string;
  interaction?: string;
}) {
  const help = id ? parameterHelp[id] : undefined;
  const current = typeof value === "number" && step !== undefined
    ? `${formatControlNumber(value, step)}${suffix}`
    : option ?? (typeof value === "boolean" ? (value ? "ON" : "OFF") : "");
  const range = minimum !== undefined && maximum !== undefined && step !== undefined
    ? `${formatControlNumber(minimum, step)}…${formatControlNumber(maximum, step)}${suffix}`
    : "";
  const title = [label, current, range].filter(Boolean).join(" · ");
  const detail = [
    help?.cn,
    help?.description ?? description,
    interaction ?? "拖动 · 滚轮 · Shift 精调 · 双击复位 · ↑↓ 步进",
  ].filter(Boolean).join(" · ");
  return `${title}|${detail}`;
}

function BloomMark({ small = false }: { small?: boolean }) {
  return (
    <img
      className={`bloom-mark${small ? " small" : ""}`}
      src="./unpure-bloom-mark.svg"
      alt=""
      aria-hidden="true"
    />
  );
}

function TooltipLayer() {
  const [tip, setTip] = useState<{ title: string; detail: string; x: number; y: number; target: HTMLElement }>();

  useEffect(() => {
    const position = (x: number, y: number, target: HTMLElement) => {
      setTip((current) => {
        if (current?.target === target) return { ...current, x, y };
        const [title = "", ...detailParts] = String(target.dataset.tip ?? "").split("|");
        return { title, detail: detailParts.join("|"), x, y, target };
      });
    };
    const onMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
      if (target) position(event.clientX, event.clientY, target);
      else setTip(undefined);
    };
    const hide = () => setTip(undefined);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", hide, { passive: true });
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;
  const tooltipWidth = Math.min(340, Math.max(220, window.innerWidth - 24));
  const tooltipLeft = tip.x + 14 + tooltipWidth <= window.innerWidth - 8
    ? tip.x + 14
    : Math.max(8, tip.x - tooltipWidth - 14);
  const tooltipTop = tip.y + 14 + 92 <= window.innerHeight - 8
    ? tip.y + 14
    : Math.max(8, tip.y - 92 - 14);
  return (
    <div
      className="hover-tooltip is-visible"
      role="tooltip"
      style={{ left: `${tooltipLeft}px`, top: `${tooltipTop}px`, maxWidth: `${tooltipWidth}px`, transform: "none" }}
    >
      <strong>{tip.title}</strong>
      {tip.detail && <span>{tip.detail}</span>}
    </div>
  );
}

function AboutModal({
  open,
  onClose,
  onOpenExternal,
}: {
  open: boolean;
  onClose: () => void;
  onOpenExternal?: (url: string) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "button, a[href], [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(".about-close")?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="about-overlay" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section ref={panelRef} className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="about-close" type="button" aria-label="关闭 About" title="Close" onClick={onClose}><X size={16} /></button>
        <div className="about-brand-row">
          <BloomMark />
          <div>
            <p className="about-kicker">UNPURE BLOOM · AUDIO INSTRUMENTS</p>
            <h2 id="about-title">openFAD Rotator</h2>
            <p className="about-sub">GUI·04 — ROTARY SPEAKER / DOPPLER / DREAM</p>
          </div>
          <span className="about-stamp">v0.1.0</span>
        </div>
        <p className="about-summary">一台专注于旋转音箱的空间效果器：先经过原创音箱性格，再进入惯性平滑的双转子、多普勒频移和柔和的 Dream 尾音。</p>
        <div className="about-grid">
          <div><span>工作流</span><strong>音箱 → 旋转 → 多普勒 → Dream → 输出</strong></div>
          <div><span>发行商</span><strong>Unpure Bloom</strong></div>
          <div><span>格式</span><strong>VST3 · AUv3</strong></div>
          <div><span>版本</span><strong>0.1.0 · GUI 04</strong></div>
          <div><span>引擎</span><strong>JUCE · WebGL2 · gl-matrix</strong></div>
          <div><span>交互</span><strong>旋钮拖动 · 滚轮 · Shift 精调 · 双击复位</strong></div>
        </div>
        <div className="about-links" aria-label="相关链接">
          {aboutLinks.map((link) => (
            <a
              key={link.href}
              className="about-link"
              href={link.href}
              target="_blank"
              rel="noreferrer"
              title={`打开 ${link.address}`}
              onClick={(event) => {
                if (onOpenExternal) {
                  event.preventDefault();
                  onOpenExternal(link.href);
                }
              }}
            >
              <span>{link.label}</span>
              <strong>{link.address}</strong>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
        <div className="about-footer">
          <CircleHelp size={14} />
          <span>悬停任意参数，可查看当前值、范围、中文解释和操作方式。</span>
        </div>
      </section>
    </div>
  );
}

function sceneControlsFromPlugin(values: PluginValues, reducedMotion: boolean): SceneControls {
  return {
    rotorRate: activeRotorRate(values),
    direction: values.direction < 0.5 ? 1 : -1,
    rotatorAmount: values.rotatorAmount,
    dopplerAmount: values.dopplerAmount,
    motion: values.motion,
    depth: values.depth,
    reducedMotion,
  };
}

function knobRatioFromValue(id: ParameterId | undefined, value: number, minimum: number, maximum: number) {
  if (maximum <= minimum) return 0;
  const clamped = Math.min(maximum, Math.max(minimum, value));
  if (id === "freeRate" || id === "tail") {
    const safeMinimum = Math.max(0.0001, minimum);
    return (Math.log(Math.max(safeMinimum, clamped)) - Math.log(safeMinimum))
      / (Math.log(Math.max(safeMinimum * 1.0001, maximum)) - Math.log(safeMinimum));
  }
  const ratio = (clamped - minimum) / (maximum - minimum);
  const power = id === "inertia" ? 0.72 : id === "predelay" ? 0.82 : 1;
  return Math.pow(Math.min(1, Math.max(0, ratio)), 1 / power);
}

function valueFromKnobRatio(id: ParameterId | undefined, ratio: number, minimum: number, maximum: number) {
  const clamped = Math.min(1, Math.max(0, ratio));
  if (id === "freeRate" || id === "tail") {
    const safeMinimum = Math.max(0.0001, minimum);
    return Math.exp(Math.log(safeMinimum) + clamped
      * (Math.log(Math.max(safeMinimum * 1.0001, maximum)) - Math.log(safeMinimum)));
  }
  const power = id === "inertia" ? 0.72 : id === "predelay" ? 0.82 : 1;
  return minimum + Math.pow(clamped, power) * (maximum - minimum);
}

function snapControlValue(value: number, minimum: number, maximum: number, step: number) {
  const snapped = step > 0 ? Math.round(value / step) * step : value;
  return Number(Math.min(maximum, Math.max(minimum, snapped)).toFixed(6));
}

function ControlSlider({
  label,
  id,
  value,
  minimum,
  maximum,
  step,
  suffix,
  description,
  disabled,
  onGestureStart,
  onGestureEnd,
  onChange,
}: {
  label: string;
  id?: ParameterId;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  suffix?: string;
  description?: string;
  disabled?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onChange: (value: number) => void;
}) {
  const gestureActive = useRef(false);
  const pointerId = useRef<number | null>(null);
  const startY = useRef(0);
  const startRatio = useRef(0);
  const [gesturing, setGesturing] = useState(false);
  const onGestureStartRef = useRef(onGestureStart);
  const onGestureEndRef = useRef(onGestureEnd);
  useEffect(() => {
    onGestureStartRef.current = onGestureStart;
    onGestureEndRef.current = onGestureEnd;
  }, [onGestureStart, onGestureEnd]);

  const beginGesture = useCallback(() => {
    if (gestureActive.current) return;
    gestureActive.current = true;
    setGesturing(true);
    onGestureStartRef.current?.();
  }, []);
  const endGesture = useCallback(() => {
    if (!gestureActive.current) return;
    gestureActive.current = false;
    setGesturing(false);
    onGestureEndRef.current?.();
  }, []);

  const finishPointer = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureActive.current) return;
    const activePointer = pointerId.current;
    if (event && activePointer !== null && event.currentTarget.hasPointerCapture(activePointer))
      event.currentTarget.releasePointerCapture(activePointer);
    gestureActive.current = false;
    pointerId.current = null;
    setGesturing(false);
    onGestureEndRef.current?.();
  }, []);

  const cancelGesture = useCallback(() => {
    if (!gestureActive.current) return;
    gestureActive.current = false;
    pointerId.current = null;
    setGesturing(false);
    onGestureEndRef.current?.();
  }, []);

  const resetValue = id ? defaultPluginValues[id] : undefined;
  const reset = useCallback(() => {
    if (disabled || typeof resetValue !== "number") return;
    beginGesture();
    onChange(resetValue);
    endGesture();
  }, [beginGesture, disabled, endGesture, onChange, resetValue]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    pointerId.current = event.pointerId;
    startY.current = event.clientY;
    startRatio.current = knobRatioFromValue(id, value, minimum, maximum);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginGesture();
  }, [beginGesture, disabled, id, maximum, minimum, value]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureActive.current || pointerId.current !== event.pointerId) return;
    event.preventDefault();
    const dy = startY.current - event.clientY;
    const travel = event.shiftKey ? 880 : 220;
    const ratio = Math.min(1, Math.max(0, startRatio.current + dy / travel));
    onChange(snapControlValue(valueFromKnobRatio(id, ratio, minimum, maximum), minimum, maximum, step));
  }, [id, maximum, minimum, onChange, step]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const ratio = knobRatioFromValue(id, value, minimum, maximum);
    const ratioStep = event.shiftKey ? 0.0025 : 0.01;
    beginGesture();
    onChange(snapControlValue(valueFromKnobRatio(id, ratio + direction * ratioStep, minimum, maximum), minimum, maximum, step));
    endGesture();
  }, [beginGesture, disabled, endGesture, id, maximum, minimum, onChange, step, value]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const fine = event.shiftKey;
    const amount = fine ? step * 0.25 : step;
    let next: number | undefined;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") next = value + amount;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = value - amount;
    else if (event.key === "Home") next = minimum;
    else if (event.key === "End") next = maximum;
    else return;
    event.preventDefault();
    beginGesture();
    onChange(snapControlValue(next, minimum, maximum, step));
    endGesture();
  }, [beginGesture, disabled, endGesture, maximum, minimum, onChange, step, value]);

  useEffect(() => {
    window.addEventListener("blur", cancelGesture);
    document.addEventListener("visibilitychange", cancelGesture);
    return () => {
      window.removeEventListener("blur", cancelGesture);
      document.removeEventListener("visibilitychange", cancelGesture);
    };
  }, [cancelGesture]);

  const ratio = knobRatioFromValue(id, value, minimum, maximum);
  const dialStyle = {
    "--angle": `${(-135 + ratio * 270).toFixed(2)}deg`,
    "--sweep": `${(ratio * 270).toFixed(2)}deg`,
  } as CSSProperties;

  return (
    <div
      className={`control-slider knob-control${gesturing ? " is-gesturing" : ""}${disabled ? " is-disabled" : ""}`}
      data-tip={controlTip({ label, id, value, minimum, maximum, step, suffix, description })}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={`${formatControlNumber(value, step)}${suffix ?? ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onLostPointerCapture={finishPointer}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
    >
      <span className="knob-dial" style={dialStyle} aria-hidden="true">
        <span className="knob-needle" />
        <span className="knob-hub" />
      </span>
      <span className="knob-label">{label}</span>
      <strong className="knob-value">{formatControlNumber(value, step)}{suffix}</strong>
    </div>
  );
}

function ControlSelect({
  label,
  id,
  value,
  options,
  disabled,
  description,
  onChange,
}: {
  label: string;
  id?: ParameterId;
  value: number;
  options: readonly string[];
  disabled?: boolean;
  description?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label
      className="control-select"
      data-tip={controlTip({ label, id, value, option: options[value], description, interaction: "点击选择 · 键盘 ↑↓ 切换" })}
    >
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        {options.map((option, index) => <option value={index} key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function OptionButtons({
  label,
  id,
  value,
  options,
  disabled,
  description,
  onChange,
}: {
  label: string;
  id?: ParameterId;
  value: number;
  options: readonly string[];
  disabled?: boolean;
  description?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className="option-control"
      data-tip={controlTip({ label, id, value, option: options[value], description, interaction: "点击选择" })}
    >
      <span>{label}</span>
      <div className="option-buttons">
        {options.map((option, index) => (
          <button
            type="button"
            key={option}
            className={value === index ? "selected" : ""}
            disabled={disabled}
            onClick={() => onChange(index)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleControl({ label, id, value, description, onChange }: { label: string; id?: ParameterId; value: boolean; description?: string; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-control" data-tip={controlTip({ label, id, value, description, interaction: "点击切换 · Space 开关" })}>
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

function RackGroup({
  title,
  icon,
  className = "",
  children,
}: {
  title: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rack-module rack-group ${className}`}>
      <div className="module-title">
        <span className="module-title-label">{title}</span>
        <span className="module-title-icon">{icon}</span>
      </div>
      <div className="module-content">{children}</div>
    </section>
  );
}

function ProgramModule({
  index,
  name,
  names,
  onPrevious,
  onNext,
  onSelect,
  onSave,
  onOpen,
}: {
  index: number;
  name: string;
  names: readonly string[];
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
  onSave: () => void;
  onOpen: () => void;
}) {
  const safeNames = names.length > 0 ? names : [name || "Program 1"];
  const safeIndex = Math.min(safeNames.length - 1, Math.max(0, index));
  const activeName = name || safeNames[safeIndex] || "Program 1";

  return (
    <section className="rack-module program-module">
      <div className="module-title"><span>PROGRAM / 预置</span><Bookmark size={15} /></div>
      <div className="program-active">
        <span>ACTIVE PATCH</span>
        <strong title={activeName}>{activeName}</strong>
      </div>
      <div className="program-picker">
        <button
          type="button"
          className="icon-button"
          title="Previous program"
          aria-label="Previous program"
          onClick={onPrevious}
        ><ChevronLeft size={15} /></button>
        <select
          aria-label="Program"
          value={safeIndex}
          onChange={(event) => onSelect(Number(event.currentTarget.value))}
        >
          {safeNames.map((programName, programIndex) => (
            <option value={programIndex} key={`${programIndex}-${programName}`}>{programName}</option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          title="Next program"
          aria-label="Next program"
          onClick={onNext}
        ><ChevronRight size={15} /></button>
      </div>
      <div className="program-actions">
        <button type="button" className="program-action" title="Open preset" aria-label="Open preset" onClick={onOpen}>
          <FolderOpen size={14} /><span>OPEN</span>
        </button>
        <button type="button" className="program-action" title="Save preset" aria-label="Save preset" onClick={onSave}>
          <Save size={14} /><span>SAVE</span>
        </button>
      </div>
    </section>
  );
}

function EnergyMeter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="energy-meter">
      <span>{label}</span>
      <div><i className={tone} style={{ width: `${Math.min(100, Math.max(1, value * 100))}%` }} /></div>
      <strong>{Math.round(value * 100)}</strong>
    </div>
  );
}

function smoothstep(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function speakerResponsePoints(profile: SpeakerProfile) {
  const points: Array<[number, number]> = [];
  const lowCorner = 0.08 + profile.lowCut * 1.8;
  const bodyCorner = 0.26 + profile.lowCut * 0.8;
  const presenceCorner = 0.46 + profile.highCut * 0.12;
  const highCorner = 0.68 + profile.highCut * 0.16;
  for (let index = 0; index < 40; index += 1) {
    const x = index / 39;
    const lowToBody = smoothstep((x - (lowCorner - 0.12)) / 0.2);
    const bodyToPresence = smoothstep((x - (bodyCorner - 0.1)) / 0.2);
    const presenceToHigh = smoothstep((x - (presenceCorner - 0.1)) / 0.22);
    const highToAir = smoothstep((x - (highCorner - 0.12)) / 0.24);
    const lowDb = 12 * Math.log10(Math.max(0.01, profile.lowGain));
    const bodyDb = 12 * Math.log10(Math.max(0.01, profile.lowMidGain));
    const midDb = 12 * Math.log10(Math.max(0.01, profile.midGain));
    const presenceDb = 12 * Math.log10(Math.max(0.01, profile.presenceGain));
    const highDb = 12 * Math.log10(Math.max(0.01, profile.highGain));
    const airDb = 12 * Math.log10(Math.max(0.01, profile.highGain * profile.airGain));
    const db = lowDb
      + (bodyDb - lowDb) * lowToBody
      + (midDb - bodyDb) * bodyToPresence
      + (presenceDb - midDb) * presenceToHigh
      + (airDb - highDb) * highToAir;
    points.push([x, Math.min(1, Math.max(-1, db / 4))]);
  }
  return points;
}

function SpeakerResponseCurve({ profile }: { profile: SpeakerProfile }) {
  const width = 280;
  const height = 86;
  const padding = { left: 7, right: 7, top: 7, bottom: 7 };
  const points = useMemo(() => speakerResponsePoints(profile), [profile]);
  const toSvg = ([x, y]: [number, number]) => {
    const px = padding.left + x * (width - padding.left - padding.right);
    const py = height / 2 - y * (height / 2 - padding.top);
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  };
  const line = points.map(toSvg).join(" ");
  const fill = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;

  return (
    <div className="speaker-curve" role="img" aria-label={`${profile.name} speaker response curve`}>
      <div className="speaker-curve-meta"><span>SPEAKER RESPONSE</span><strong>{profile.name}</strong></div>
      <svg className="speaker-curve-plot" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="speaker-curve-grid" x1={padding.left} x2={width - padding.right} y1={height / 2} y2={height / 2} />
        <line className="speaker-curve-grid" x1={padding.left + (width - padding.left - padding.right) * 0.5} x2={padding.left + (width - padding.left - padding.right) * 0.5} y1={padding.top} y2={height - padding.bottom} />
        <polygon className="speaker-curve-fill" points={fill} />
        <polyline className="speaker-curve-line" points={line} />
      </svg>
      <div className="speaker-curve-axis"><span>20 Hz</span><span>1 kHz</span><span>20 kHz</span></div>
    </div>
  );
}

function telemetryFrame(telemetry: NativeTelemetry): AudioFrame {
  const bands = telemetry.bands ?? [];
  return {
    low: Math.min(1, Math.max(0, (bands[0] ?? 0) * 18)),
    mid: Math.min(1, Math.max(0, (bands[1] ?? 0) * 18)),
    high: Math.min(1, Math.max(0, (bands[2] ?? 0) * 18)),
    peak: Math.min(1, Math.max(0, telemetry.outputPeak ?? telemetry.inputPeak ?? 0)),
  };
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AcousticLabScene | null>(null);
  const audioRef = useRef(new AudioReactiveEngine());
  const nativeBridgeRef = useRef<NativeBridge | null>(null);
  const nativeGestureValues = useRef<Record<string, number>>({});
  const pluginValuesRef = useRef<PluginValues>({ ...defaultPluginValues });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeAtStartup = typeof window !== "undefined" && Boolean(window.__JUCE__?.backend);
  const [pluginValues, setPluginValues] = useState<PluginValues>({ ...defaultPluginValues });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [actualRotorRate, setActualRotorRate] = useState(activeRotorRate(defaultPluginValues));
  const [nativeAudioPlaying, setNativeAudioPlaying] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode | "native">(nativeAtStartup ? "native" : "idle");
  const [nativeConnected, setNativeConnected] = useState(nativeAtStartup);
  const [meters, setMeters] = useState<AudioFrame>({ low: 0, mid: 0, high: 0, peak: 0 });
  const [speakerProfiles, setSpeakerProfiles] = useState<readonly SpeakerProfile[]>(defaultSpeakerProfiles);
  const [program, setProgram] = useState(0);
  const [programName, setProgramName] = useState("Gentle Rotation");
  const [programNames, setProgramNames] = useState<readonly string[]>([
    "Gentle Rotation", "Console Slow", "Cinema Motion", "Nearfield Tremolo",
    "Coral Drift", "Prism Air", "Still Bloom", "Axis Break",
  ]);
  const [programCount, setProgramCount] = useState(8);
  const [fileName, setFileName] = useState(nativeAtStartup ? "NATIVE PLUGIN INPUT" : "NO FILE");
  const [error, setError] = useState<string>();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [uiSize, setUiSize] = useState<"small" | "medium" | "large">("medium");
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const openExternal = useCallback((url: string) => {
    if (nativeConnected) nativeBridgeRef.current?.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [nativeConnected]);

  useEffect(() => {
    document.body.dataset.uiSize = uiSize;
    return () => {
      delete document.body.dataset.uiSize;
    };
  }, [uiSize]);

  const controls = useMemo(
    () => sceneControlsFromPlugin(pluginValues, reducedMotion),
    [pluginValues, reducedMotion],
  );

  const applyPluginValues = useCallback((next: PluginValues) => {
    pluginValuesRef.current = next;
    setPluginValues(next);
  }, []);

  const patchPluginValues = useCallback((patch: Partial<PluginValues>) => {
    applyPluginValues({ ...pluginValuesRef.current, ...patch });
  }, [applyPluginValues]);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      sceneRef.current = new AcousticLabScene(canvasRef.current);
      sceneRef.current.setControls(controls);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "WebGL renderer could not start");
    }
    return () => sceneRef.current?.destroy();
  }, []);

  useEffect(() => {
    sceneRef.current?.setControls(controls);
  }, [controls]);

  useEffect(() => {
    const bridge = new NativeBridge(
      (state: NativeState) => {
        applyPluginValues(parsePluginValues(state, pluginValuesRef.current.bpm));
        if (state.speakerProfiles && state.speakerProfiles.length > 0)
          setSpeakerProfiles(state.speakerProfiles);
        if (typeof state.program === "number" && Number.isFinite(state.program))
          setProgram(Math.max(0, Math.round(state.program)));
        if (typeof state.programName === "string" && state.programName.length > 0)
          setProgramName(state.programName);
        if (Array.isArray(state.programNames) && state.programNames.length > 0)
          setProgramNames(state.programNames);
        if (typeof state.programCount === "number" && Number.isFinite(state.programCount))
          setProgramCount(Math.max(1, Math.round(state.programCount)));
      },
      (telemetry: NativeTelemetry) => {
        sceneRef.current?.updateTelemetry(telemetry);
        setMeters(telemetryFrame(telemetry));
        setNativeAudioPlaying(telemetry.playing === true);
        if (typeof telemetry.rotorRate === "number" && Number.isFinite(telemetry.rotorRate)) {
          setActualRotorRate(Math.max(0, telemetry.rotorRate));
        }
        if (typeof telemetry.bpm === "number" && Number.isFinite(telemetry.bpm)
            && Math.abs(telemetry.bpm - pluginValuesRef.current.bpm) > 0.05) {
          applyPluginValues({ ...pluginValuesRef.current, bpm: telemetry.bpm });
        }
      },
      (notice) => {
        if (notice && typeof notice === "object" && "message" in notice) {
          setError(String((notice as { message?: unknown }).message ?? ""));
        }
      },
    );

    nativeBridgeRef.current = bridge;
    if (bridge.available) {
      setNativeConnected(true);
      setAudioMode("native");
      setFileName("NATIVE PLUGIN INPUT");
      bridge.connect();
    }

    return () => {
      bridge.dispose();
      nativeBridgeRef.current = null;
    };
  }, [applyPluginValues]);

  useEffect(() => {
    if (nativeConnected) return undefined;
    let frame = 0;
    let lastMeterUpdate = 0;
    const tick = (time: number) => {
      const next = audioRef.current.readFrame();
      sceneRef.current?.setAudioFrame(next);
      if (time - lastMeterUpdate > 80) {
        lastMeterUpdate = time;
        setMeters(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      void audioRef.current.stop();
    };
  }, [nativeConnected]);

  const beginParameter = useCallback((id: keyof PluginValues) => {
    if (!nativeConnected) return;
    const bridge = nativeBridgeRef.current;
    const actual = pluginValuesRef.current[id];
    if (!bridge || (typeof actual !== "number" && typeof actual !== "boolean")) return;
    const normalized = normalisedForParameter(id, actual);
    nativeGestureValues.current[id] = normalized;
    bridge.parameterGesture(id, "begin", normalized);
  }, [nativeConnected]);

  const setParameter = useCallback(<K extends keyof PluginValues>(id: K, value: PluginValues[K]) => {
    patchPluginValues({ [id]: value } as Partial<PluginValues>);
    if (!nativeConnected) return;
    const bridge = nativeBridgeRef.current;
    if (!bridge) return;
    const normalized = normalisedForParameter(id, value);
    nativeGestureValues.current[id] = normalized;
    bridge.parameterGesture(id, "set", normalized);
  }, [nativeConnected, patchPluginValues]);

  const endParameter = useCallback((id: keyof PluginValues) => {
    if (!nativeConnected) return;
    const bridge = nativeBridgeRef.current;
    if (!bridge) return;
    const actual = pluginValuesRef.current[id];
    if (typeof actual !== "number" && typeof actual !== "boolean") return;
    const normalized = nativeGestureValues.current[id] ?? normalisedForParameter(id, actual);
    bridge.parameterGesture(id, "end", normalized);
    delete nativeGestureValues.current[id];
  }, [nativeConnected]);

  const commitParameter = useCallback(<K extends keyof PluginValues>(id: K, value: PluginValues[K]) => {
    patchPluginValues({ [id]: value } as Partial<PluginValues>);
    if (!nativeConnected) return;
    const bridge = nativeBridgeRef.current;
    if (!bridge) return;
    const normalized = normalisedForParameter(id, value);
    bridge.parameterGesture(id, "begin", normalized);
    bridge.parameterGesture(id, "set", normalized);
    bridge.parameterGesture(id, "end", normalized);
  }, [nativeConnected, patchPluginValues]);

  const setDirection = (direction: 1 | -1) => {
    commitParameter("direction", direction === 1 ? 0 : 1);
  };

  const selectProgram = (index: number) => {
    if (!nativeConnected) return;
    setProgram(index);
    setProgramName(programNames[index] ?? `Program ${index + 1}`);
    nativeBridgeRef.current?.program(index);
  };

  const beginDemo = async () => {
    if (nativeConnected) return;
    try {
      setError(undefined);
      await audioRef.current.startDemo();
      setAudioMode("demo");
      setFileName("SYNTHETIC TEST");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Demo audio could not start");
    }
  };

  const beginMicrophone = async () => {
    if (nativeConnected) return;
    try {
      setError(undefined);
      await audioRef.current.startMicrophone();
      setAudioMode("microphone");
      setFileName("LIVE INPUT");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Microphone permission was not granted");
    }
  };

  const stopAudio = async () => {
    if (nativeConnected) return;
    await audioRef.current.stop();
    setAudioMode("idle");
    setFileName("NO FILE");
  };

  const loadFile = async (file?: File) => {
    if (!file || nativeConnected) return;
    try {
      setError(undefined);
      await audioRef.current.startFile(file);
      setAudioMode("file");
      setFileName(file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Audio file could not be decoded");
    }
  };

  // Standalone can expose a stale DSP snapshot while no host audio callback is
  // running. Keep the readout responsive to the selected target until actual
  // playback telemetry is available.
  const displayedActualRate = nativeConnected && nativeAudioPlaying
    ? actualRotorRate
    : controls.rotorRate;
  const selectedSpeakerProfile = speakerProfiles[pluginValues.model]
    ?? defaultSpeakerProfiles[pluginValues.model]
    ?? defaultSpeakerProfiles[0];

  return (
    <main className="app-shell">
      <header className="system-bar">
        <div className="identity">
          <button
            className="brand-lockup"
            type="button"
            aria-haspopup="dialog"
            aria-controls="about-title"
            data-tip="ABOUT / 关于|打开产品信息、发行商和交互说明。"
            onClick={() => setAboutOpen(true)}
          >
            <BloomMark />
            <span>
              <strong>openFAD Rotator</strong>
              <small>UNPURE BLOOM / AUDIO INSTRUMENTS</small>
            </span>
          </button>
        </div>
        <div className="engine-state">
          <span><i className="live-dot" />WEBGL2</span>
          <span>GL-MATRIX</span>
          <span className={audioMode === "idle" ? "muted" : "active"}>{audioMode.toUpperCase()}</span>
        </div>
        <div className="system-actions">
          <div className="ui-size-picker" role="group" aria-label="界面尺寸">
            {(["small", "medium", "large"] as const).map((size) => (
              <button
                key={size}
                type="button"
                className={uiSize === size ? "selected" : ""}
                title={`${size === "small" ? "小" : size === "medium" ? "中" : "大"}界面`}
                aria-label={`${size === "small" ? "小" : size === "medium" ? "中" : "大"}界面`}
                aria-pressed={uiSize === size}
                onClick={() => setUiSize(size)}
              >
                {size === "small" ? "S" : size === "medium" ? "M" : "L"}
              </button>
            ))}
          </div>
          <button
            className={`icon-button ${reducedMotion ? "selected" : ""}`}
            title="Reduced motion"
            aria-label="Reduced motion"
            aria-pressed={reducedMotion}
            onClick={() => setReducedMotion((current) => !current)}
          ><Activity size={16} /></button>
          <button className="icon-button" type="button" title="About openFAD Rotator" aria-label="About openFAD Rotator" onClick={() => setAboutOpen(true)}>
            <Info size={16} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="visual-surface">
          <canvas ref={canvasRef} aria-label="WebGL rotary speaker mechanism" />
          <div className="scene-index scene-index-top">
            <span>ROTOR RATE / TARGET</span>
            <strong>{controls.rotorRate.toFixed(2)} Hz</strong>
          </div>
          <div className="scene-index scene-index-bottom">
            <span>ROTOR RATE / ACTUAL</span>
            <strong>{displayedActualRate.toFixed(2)} Hz</strong>
          </div>
          <div className="scene-model">
            <span>SPEAKER MODEL</span>
            <strong>{modelOptions[pluginValues.model] ?? modelOptions[0]}</strong>
          </div>
          <div className="scene-axis"><span>FIXED DRIVER</span><i /><span>ROTATING HORN</span><i /><span>FIXED BASS</span><i /><span>DERIVED DRUM ×0.46</span><i /></div>
          {error && <div className="render-error" role="alert">{error}</div>}
        </section>

        <aside className="control-rack">
          {!nativeConnected && <section className="rack-module audio-module browser-audio-module">
            <div className="module-title"><span>AUDIO PREVIEW / 预览</span><AudioLines size={15} /></div>
            <>
              <div className="transport-buttons">
                <button className={audioMode === "demo" ? "selected" : ""} onClick={() => void beginDemo()}><Play size={15} /><span>DEMO</span></button>
                <button className={audioMode === "microphone" ? "selected" : ""} onClick={() => void beginMicrophone()}><Mic size={15} /><span>MIC</span></button>
                <button className={audioMode === "file" ? "selected" : ""} onClick={() => fileInputRef.current?.click()}><FileAudio size={15} /><span>FILE</span></button>
                <button onClick={() => void stopAudio()} disabled={audioMode === "idle"}><Pause size={15} /><span>STOP</span></button>
              </div>
              <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={(event) => void loadFile(event.currentTarget.files?.[0])} />
            </>
            <div className="source-readout" title={fileName}>{fileName}</div>
            <div className="meter-bank">
              <EnergyMeter label="LOW" value={meters.low} tone="rust" />
              <EnergyMeter label="MID" value={meters.mid} tone="indigo" />
              <EnergyMeter label="HIGH" value={meters.high} tone="brass" />
              <EnergyMeter label="PEAK" value={meters.peak} tone="pine" />
            </div>
          </section>}

          {nativeConnected && <ProgramModule
            index={program}
            name={programName}
            names={programNames.slice(0, Math.max(programCount, 1))}
            onPrevious={() => nativeBridgeRef.current?.previousProgram()}
            onNext={() => nativeBridgeRef.current?.nextProgram()}
            onSelect={selectProgram}
            onSave={() => nativeBridgeRef.current?.savePreset()}
            onOpen={() => nativeBridgeRef.current?.openPreset()}
          />}

          <div className="rack-path-label"><span>SIGNAL PATH</span><strong>音响 → 旋转 → 空间 → 输出</strong></div>

          <RackGroup title="SPEAKER / 音箱" icon={<SlidersHorizontal size={15} />} className="speaker-group">
            <ControlSelect id="model" label="MODEL" value={pluginValues.model} options={modelOptions} onChange={(value) => commitParameter("model", value)} />
            <SpeakerResponseCurve profile={selectedSpeakerProfile} />
            <ControlSlider id="modelAmount" label="MODEL AMOUNT" value={pluginValues.modelAmount} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("modelAmount")} onGestureEnd={() => endParameter("modelAmount")} onChange={(value) => setParameter("modelAmount", value)} />
            <ControlSlider id="drive" label="DRIVE" value={pluginValues.drive} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("drive")} onGestureEnd={() => endParameter("drive")} onChange={(value) => setParameter("drive", value)} />
            <ControlSlider id="resonance" label="CABINET RESONANCE" value={pluginValues.resonance} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("resonance")} onGestureEnd={() => endParameter("resonance")} onChange={(value) => setParameter("resonance", value)} />
            <ControlSlider id="damping" label="CABINET DAMPING" value={pluginValues.damping} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("damping")} onGestureEnd={() => endParameter("damping")} onChange={(value) => setParameter("damping", value)} />
            <ToggleControl id="modelBypass" label="MODEL BYPASS" value={pluginValues.modelBypass} onChange={(value) => commitParameter("modelBypass", value)} />
            <ToggleControl id="loudnessMatch" label="LOUDNESS MATCH" value={pluginValues.loudnessMatch} onChange={(value) => commitParameter("loudnessMatch", value)} />
          </RackGroup>

          <RackGroup title="ROTATION / 旋转" icon={<SlidersHorizontal size={15} />} className="rotation-group">
            <OptionButtons id="speedMode" label="SPEED MODE" value={pluginValues.speedMode} options={speedModeOptions} onChange={(value) => commitParameter("speedMode", value)} />
            <ControlSlider id="freeRate" label="FREE RATE" value={pluginValues.freeRate} minimum={0.02} maximum={20} step={0.01} suffix=" Hz" disabled={pluginValues.speedMode !== 3} onGestureStart={() => beginParameter("freeRate")} onGestureEnd={() => endParameter("freeRate")} onChange={(value) => setParameter("freeRate", value)} />
            <ControlSelect id="syncDivision" label="SYNC DIVISION" value={pluginValues.syncDivision} options={syncDivisionOptions} disabled={pluginValues.speedMode !== 4} onChange={(value) => commitParameter("syncDivision", value)} />
            <div className="direction-control" data-tip={controlTip({ label: "DIRECTION", id: "direction", option: pluginValues.direction < 0.5 ? "CW" : "CCW" })}>
              <span>DIRECTION</span>
              <div>
                <button type="button" className={pluginValues.direction < 0.5 ? "selected" : ""} onClick={() => setDirection(1)}>CW</button>
                <button type="button" className={pluginValues.direction >= 0.5 ? "selected" : ""} onClick={() => setDirection(-1)}>CCW</button>
              </div>
            </div>
            <ControlSlider id="inertia" label="INERTIA" value={pluginValues.inertia} minimum={0.05} maximum={12} step={0.01} suffix=" s" onGestureStart={() => beginParameter("inertia")} onGestureEnd={() => endParameter("inertia")} onChange={(value) => setParameter("inertia", value)} />
            <ControlSelect id="structure" label="STRUCTURE" value={pluginValues.structure} options={structureOptions} onChange={(value) => commitParameter("structure", value)} />
            <ControlSlider id="rotatorAmount" label="ROTATOR AMOUNT" value={pluginValues.rotatorAmount} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("rotatorAmount")} onGestureEnd={() => endParameter("rotatorAmount")} onChange={(value) => setParameter("rotatorAmount", value)} />
            <ControlSlider id="motion" label="MOTION" value={pluginValues.motion} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("motion")} onGestureEnd={() => endParameter("motion")} onChange={(value) => setParameter("motion", value)} />
            <ControlSlider id="depth" label="ROTOR DEPTH" value={pluginValues.depth} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("depth")} onGestureEnd={() => endParameter("depth")} onChange={(value) => setParameter("depth", value)} />
          </RackGroup>

          <div className="rack-path-label advanced-path-label"><span>ADVANCED SPACE</span><strong>空间 / 多普勒 / 梦境</strong></div>

          <RackGroup title="SPACE / 空间" icon={<Activity size={15} />} className="space-group">
            <ControlSlider id="distance" label="LISTENER DISTANCE" value={pluginValues.distance} minimum={0.5} maximum={3} step={0.01} suffix=" m" onGestureStart={() => beginParameter("distance")} onGestureEnd={() => endParameter("distance")} onChange={(value) => setParameter("distance", value)} />
            <ControlSlider id="angle" label="LISTENER ANGLE" value={pluginValues.angle} minimum={-45} maximum={45} step={0.1} suffix="°" onGestureStart={() => beginParameter("angle")} onGestureEnd={() => endParameter("angle")} onChange={(value) => setParameter("angle", value)} />
            <ControlSlider id="earlyReflections" label="EARLY REFLECTIONS" value={pluginValues.earlyReflections} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("earlyReflections")} onGestureEnd={() => endParameter("earlyReflections")} onChange={(value) => setParameter("earlyReflections", value)} />
            <ControlSlider id="roomDamping" label="ROOM DAMPING" value={pluginValues.roomDamping} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("roomDamping")} onGestureEnd={() => endParameter("roomDamping")} onChange={(value) => setParameter("roomDamping", value)} />
            <ControlSelect id="feedMode" label="FEED MODE" value={pluginValues.feedMode} options={feedModeOptions} onChange={(value) => commitParameter("feedMode", value)} />
            <ControlSelect id="renderMode" label="RENDER MODE" value={pluginValues.renderMode} options={renderModeOptions} onChange={(value) => commitParameter("renderMode", value)} />
          </RackGroup>

          <RackGroup title="DOPPLER / 多普勒" icon={<Activity size={15} />} className="doppler-group">
            <ControlSlider id="dopplerAmount" label="DOPPLER AMOUNT" value={pluginValues.dopplerAmount} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("dopplerAmount")} onGestureEnd={() => endParameter("dopplerAmount")} onChange={(value) => setParameter("dopplerAmount", value)} />
          </RackGroup>

          <RackGroup title="DREAM / 梦境" icon={<Activity size={15} />} className="dream-group">
            <ControlSlider id="character" label="CHARACTER" value={pluginValues.character} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("character")} onGestureEnd={() => endParameter("character")} onChange={(value) => setParameter("character", value)} />
            <ControlSlider id="space" label="SPACE" value={pluginValues.space} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("space")} onGestureEnd={() => endParameter("space")} onChange={(value) => setParameter("space", value)} />
            <ControlSlider id="dream" label="DREAM" value={pluginValues.dream} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("dream")} onGestureEnd={() => endParameter("dream")} onChange={(value) => setParameter("dream", value)} />
            <ToggleControl id="dreamBypass" label="DREAM BYPASS" value={pluginValues.dreamBypass} onChange={(value) => commitParameter("dreamBypass", value)} />
            <ControlSlider id="predelay" label="DREAM PREDELAY" value={pluginValues.predelay} minimum={0} maximum={0.25} step={0.001} suffix=" s" onGestureStart={() => beginParameter("predelay")} onGestureEnd={() => endParameter("predelay")} onChange={(value) => setParameter("predelay", value)} />
            <ToggleControl id="predelaySync" label="PREDELAY SYNC" value={pluginValues.predelaySync} onChange={(value) => commitParameter("predelaySync", value)} />
            <ControlSlider id="diffusion" label="DIFFUSION" value={pluginValues.diffusion} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("diffusion")} onGestureEnd={() => endParameter("diffusion")} onChange={(value) => setParameter("diffusion", value)} />
            <ControlSlider id="tail" label="DREAM TAIL" value={pluginValues.tail} minimum={0.2} maximum={12} step={0.01} suffix=" s" onGestureStart={() => beginParameter("tail")} onGestureEnd={() => endParameter("tail")} onChange={(value) => setParameter("tail", value)} />
            <ControlSlider id="microshift" label="MICROSHIFT" value={pluginValues.microshift} minimum={0} maximum={25} step={0.01} suffix=" ct" onGestureStart={() => beginParameter("microshift")} onGestureEnd={() => endParameter("microshift")} onChange={(value) => setParameter("microshift", value)} />
            <ControlSlider id="dreamDamping" label="DREAM DAMPING" value={pluginValues.dreamDamping} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("dreamDamping")} onGestureEnd={() => endParameter("dreamDamping")} onChange={(value) => setParameter("dreamDamping", value)} />
            <ControlSlider id="feedback" label="DREAM FEEDBACK" value={pluginValues.feedback} minimum={0} maximum={0.96} step={0.01} onGestureStart={() => beginParameter("feedback")} onGestureEnd={() => endParameter("feedback")} onChange={(value) => setParameter("feedback", value)} />
            <ToggleControl id="freeze" label="DREAM FREEZE" value={pluginValues.freeze} onChange={(value) => commitParameter("freeze", value)} />
          </RackGroup>

          <div className="rack-path-label output-path-label"><span>FINAL STAGE</span><strong>输出 / 监听</strong></div>

          <RackGroup title="OUTPUT / 输出" icon={<SlidersHorizontal size={15} />} className="output-group">
            <ControlSlider id="mix" label="MIX" value={pluginValues.mix} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("mix")} onGestureEnd={() => endParameter("mix")} onChange={(value) => setParameter("mix", value)} />
            <ToggleControl id="bypass" label="BYPASS" value={pluginValues.bypass} onChange={(value) => commitParameter("bypass", value)} />
            <ControlSlider id="inputTrim" label="INPUT TRIM" value={pluginValues.inputTrim} minimum={-24} maximum={24} step={0.1} suffix=" dB" onGestureStart={() => beginParameter("inputTrim")} onGestureEnd={() => endParameter("inputTrim")} onChange={(value) => setParameter("inputTrim", value)} />
            <ControlSlider id="outputTrim" label="OUTPUT TRIM" value={pluginValues.outputTrim} minimum={-24} maximum={12} step={0.1} suffix=" dB" onGestureStart={() => beginParameter("outputTrim")} onGestureEnd={() => endParameter("outputTrim")} onChange={(value) => setParameter("outputTrim", value)} />
            <ControlSelect id="quality" label="QUALITY" value={pluginValues.quality} options={qualityOptions} onChange={(value) => commitParameter("quality", value)} />
          </RackGroup>
        </aside>
      </section>

      <footer className="status-bar">
        <span>RAW WEBGL2 / NO THREE.JS</span>
        <span>APVTS LINK / NATIVE TELEMETRY</span>
        <span>{pluginValues.bpm.toFixed(1)} BPM / {syncDivisionOptions[pluginValues.syncDivision]}</span>
      </footer>
      <TooltipLayer />
      <AboutModal open={aboutOpen} onClose={closeAbout} onOpenExternal={openExternal} />
    </main>
  );
}

export default App;
