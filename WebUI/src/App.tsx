import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  FileAudio,
  Mic,
  Pause,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { AudioReactiveEngine, type AudioMode } from "./audio";
import { NativeBridge, type NativeState, type NativeTelemetry } from "./nativeBridge";
import {
  activeRotorRate,
  defaultPluginValues,
  feedModeOptions,
  modelOptions,
  normalisedForParameter,
  parsePluginValues,
  qualityOptions,
  renderModeOptions,
  speedModeOptions,
  structureOptions,
  syncDivisionOptions,
  type PluginValues,
} from "./parameterContract";
import { AcousticLabScene, type AudioFrame, type SceneControls } from "./scene";

function sceneControlsFromPlugin(values: PluginValues, reducedMotion: boolean): SceneControls {
  return {
    rotorRate: activeRotorRate(values),
    direction: values.direction < 0.5 ? 1 : -1,
    rotatorAmount: values.rotatorAmount,
    motion: values.motion,
    depth: values.depth,
    reducedMotion,
  };
}

function ControlSlider({
  label,
  value,
  minimum,
  maximum,
  step,
  suffix,
  disabled,
  onGestureStart,
  onGestureEnd,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onChange: (value: number) => void;
}) {
  const gestureActive = useRef(false);
  const onGestureStartRef = useRef(onGestureStart);
  const onGestureEndRef = useRef(onGestureEnd);
  useEffect(() => {
    onGestureStartRef.current = onGestureStart;
    onGestureEndRef.current = onGestureEnd;
  }, [onGestureStart, onGestureEnd]);

  const beginGesture = useCallback(() => {
    if (gestureActive.current) return;
    gestureActive.current = true;
    onGestureStartRef.current?.();
  }, []);
  const endGesture = useCallback(() => {
    if (!gestureActive.current) return;
    gestureActive.current = false;
    onGestureEndRef.current?.();
  }, []);

  useEffect(() => {
    window.addEventListener("blur", endGesture);
    document.addEventListener("visibilitychange", endGesture);
    return () => {
      window.removeEventListener("blur", endGesture);
      document.removeEventListener("visibilitychange", endGesture);
    };
  }, [endGesture]);

  return (
    <label className="control-slider">
      <span>{label}</span>
      <strong>{value.toFixed(step < 0.05 ? 2 : 1)}{suffix}</strong>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={beginGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onBlur={endGesture}
        onKeyDown={beginGesture}
        onChange={(event) => {
          beginGesture();
          onChange(Number(event.currentTarget.value));
        }}
      />
    </label>
  );
}

function ControlSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly string[];
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control-select">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        {options.map((option, index) => <option value={index} key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function OptionButtons({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly string[];
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="option-control">
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

function ToggleControl({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
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
  const [fileName, setFileName] = useState(nativeAtStartup ? "NATIVE PLUGIN INPUT" : "NO FILE");
  const [error, setError] = useState<string>();

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

  return (
    <main className="app-shell">
      <header className="system-bar">
        <div className="identity">
          <span className="brand-mark">oF</span>
          <div><strong>openFAD Rotator</strong><small>VISUAL MECHANISM / 视觉机构</small></div>
        </div>
        <div className="engine-state">
          <span><i className="live-dot" />WEBGL2</span>
          <span>GL-MATRIX</span>
          <span className={audioMode === "idle" ? "muted" : "active"}>{audioMode.toUpperCase()}</span>
        </div>
        <div className="system-actions">
          <button
            className={`icon-button ${reducedMotion ? "selected" : ""}`}
            title="Reduced motion"
            aria-label="Reduced motion"
            aria-pressed={reducedMotion}
            onClick={() => setReducedMotion((current) => !current)}
          ><Activity size={16} /></button>
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

          <section className="rack-module speaker-module">
            <div className="module-title"><span>SPEAKER MODEL / 音箱</span><SlidersHorizontal size={15} /></div>
            <ControlSelect label="MODEL" value={pluginValues.model} options={modelOptions} onChange={(value) => commitParameter("model", value)} />
            <ControlSlider label="MODEL AMOUNT" value={pluginValues.modelAmount} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("modelAmount")} onGestureEnd={() => endParameter("modelAmount")} onChange={(value) => setParameter("modelAmount", value)} />
            <ControlSlider label="DRIVE" value={pluginValues.drive} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("drive")} onGestureEnd={() => endParameter("drive")} onChange={(value) => setParameter("drive", value)} />
            {!nativeConnected && <>
              <ControlSlider label="CABINET RESONANCE" value={pluginValues.resonance} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("resonance")} onGestureEnd={() => endParameter("resonance")} onChange={(value) => setParameter("resonance", value)} />
              <ControlSlider label="CABINET DAMPING" value={pluginValues.damping} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("damping")} onGestureEnd={() => endParameter("damping")} onChange={(value) => setParameter("damping", value)} />
            </>}
            <ToggleControl label="MODEL BYPASS" value={pluginValues.modelBypass} onChange={(value) => commitParameter("modelBypass", value)} />
            <ToggleControl label="LOUDNESS MATCH" value={pluginValues.loudnessMatch} onChange={(value) => commitParameter("loudnessMatch", value)} />
          </section>

          <section className="rack-module rotor-module">
            <div className="module-title"><span>ROTOR DRIVE / 转子</span><SlidersHorizontal size={15} /></div>
            <OptionButtons label="SPEED MODE" value={pluginValues.speedMode} options={speedModeOptions} onChange={(value) => commitParameter("speedMode", value)} />
            <ControlSlider label="FREE RATE" value={pluginValues.freeRate} minimum={0.02} maximum={20} step={0.01} suffix=" Hz" disabled={pluginValues.speedMode !== 3} onGestureStart={() => beginParameter("freeRate")} onGestureEnd={() => endParameter("freeRate")} onChange={(value) => setParameter("freeRate", value)} />
            <ControlSelect label="SYNC DIVISION" value={pluginValues.syncDivision} options={syncDivisionOptions} disabled={pluginValues.speedMode !== 4} onChange={(value) => commitParameter("syncDivision", value)} />
            <div className="direction-control">
              <span>DIRECTION</span>
              <div>
                <button type="button" className={pluginValues.direction < 0.5 ? "selected" : ""} onClick={() => setDirection(1)}>CW</button>
                <button type="button" className={pluginValues.direction >= 0.5 ? "selected" : ""} onClick={() => setDirection(-1)}>CCW</button>
              </div>
            </div>
            {!nativeConnected && <>
              <ControlSlider label="INERTIA" value={pluginValues.inertia} minimum={0.05} maximum={12} step={0.01} suffix=" s" onGestureStart={() => beginParameter("inertia")} onGestureEnd={() => endParameter("inertia")} onChange={(value) => setParameter("inertia", value)} />
              <ControlSelect label="STRUCTURE" value={pluginValues.structure} options={structureOptions} onChange={(value) => commitParameter("structure", value)} />
              <ControlSelect label="FEED MODE" value={pluginValues.feedMode} options={feedModeOptions} onChange={(value) => commitParameter("feedMode", value)} />
              <ControlSelect label="RENDER MODE" value={pluginValues.renderMode} options={renderModeOptions} onChange={(value) => commitParameter("renderMode", value)} />
            </>}
          </section>

          <section className="rack-module response-module">
            <div className="module-title"><span>ROTATOR / 旋转</span><Activity size={15} /></div>
            <ControlSlider label="ROTATOR AMOUNT" value={pluginValues.rotatorAmount} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("rotatorAmount")} onGestureEnd={() => endParameter("rotatorAmount")} onChange={(value) => setParameter("rotatorAmount", value)} />
            <ControlSlider label="MOTION" value={pluginValues.motion} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("motion")} onGestureEnd={() => endParameter("motion")} onChange={(value) => setParameter("motion", value)} />
            <ControlSlider label="ROTOR DEPTH" value={pluginValues.depth} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("depth")} onGestureEnd={() => endParameter("depth")} onChange={(value) => setParameter("depth", value)} />
            {!nativeConnected && <>
              <ControlSlider label="LISTENER DISTANCE" value={pluginValues.distance} minimum={0.5} maximum={3} step={0.01} suffix=" m" onGestureStart={() => beginParameter("distance")} onGestureEnd={() => endParameter("distance")} onChange={(value) => setParameter("distance", value)} />
              <ControlSlider label="LISTENER ANGLE" value={pluginValues.angle} minimum={-45} maximum={45} step={0.1} suffix="°" onGestureStart={() => beginParameter("angle")} onGestureEnd={() => endParameter("angle")} onChange={(value) => setParameter("angle", value)} />
              <ControlSlider label="EARLY REFLECTIONS" value={pluginValues.earlyReflections} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("earlyReflections")} onGestureEnd={() => endParameter("earlyReflections")} onChange={(value) => setParameter("earlyReflections", value)} />
              <ControlSlider label="ROOM DAMPING" value={pluginValues.roomDamping} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("roomDamping")} onGestureEnd={() => endParameter("roomDamping")} onChange={(value) => setParameter("roomDamping", value)} />
            </>}
          </section>

          <section className="rack-module dream-module">
            <div className="module-title"><span>DREAM / 梦境</span><Activity size={15} /></div>
            <ControlSlider label="CHARACTER" value={pluginValues.character} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("character")} onGestureEnd={() => endParameter("character")} onChange={(value) => setParameter("character", value)} />
            <ControlSlider label="SPACE" value={pluginValues.space} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("space")} onGestureEnd={() => endParameter("space")} onChange={(value) => setParameter("space", value)} />
            <ControlSlider label="DREAM" value={pluginValues.dream} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("dream")} onGestureEnd={() => endParameter("dream")} onChange={(value) => setParameter("dream", value)} />
            <ToggleControl label="DREAM BYPASS" value={pluginValues.dreamBypass} onChange={(value) => commitParameter("dreamBypass", value)} />
            {!nativeConnected && <>
              <ControlSlider label="DREAM PREDELAY" value={pluginValues.predelay} minimum={0} maximum={0.25} step={0.001} suffix=" s" onGestureStart={() => beginParameter("predelay")} onGestureEnd={() => endParameter("predelay")} onChange={(value) => setParameter("predelay", value)} />
              <ToggleControl label="PREDELAY SYNC" value={pluginValues.predelaySync} onChange={(value) => commitParameter("predelaySync", value)} />
              <ControlSlider label="DIFFUSION" value={pluginValues.diffusion} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("diffusion")} onGestureEnd={() => endParameter("diffusion")} onChange={(value) => setParameter("diffusion", value)} />
              <ControlSlider label="DREAM TAIL" value={pluginValues.tail} minimum={0.2} maximum={12} step={0.01} suffix=" s" onGestureStart={() => beginParameter("tail")} onGestureEnd={() => endParameter("tail")} onChange={(value) => setParameter("tail", value)} />
              <ControlSlider label="MICROSHIFT" value={pluginValues.microshift} minimum={0} maximum={25} step={0.01} suffix=" ct" onGestureStart={() => beginParameter("microshift")} onGestureEnd={() => endParameter("microshift")} onChange={(value) => setParameter("microshift", value)} />
              <ControlSlider label="DREAM DAMPING" value={pluginValues.dreamDamping} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("dreamDamping")} onGestureEnd={() => endParameter("dreamDamping")} onChange={(value) => setParameter("dreamDamping", value)} />
              <ControlSlider label="DREAM FEEDBACK" value={pluginValues.feedback} minimum={0} maximum={0.96} step={0.01} onGestureStart={() => beginParameter("feedback")} onGestureEnd={() => endParameter("feedback")} onChange={(value) => setParameter("feedback", value)} />
              <ToggleControl label="DREAM FREEZE" value={pluginValues.freeze} onChange={(value) => commitParameter("freeze", value)} />
            </>}
          </section>

          <section className="rack-module output-module">
            <div className="module-title"><span>OUTPUT / 输出</span><SlidersHorizontal size={15} /></div>
            <ControlSlider label="MIX" value={pluginValues.mix} minimum={0} maximum={1} step={0.01} onGestureStart={() => beginParameter("mix")} onGestureEnd={() => endParameter("mix")} onChange={(value) => setParameter("mix", value)} />
            <ToggleControl label="BYPASS" value={pluginValues.bypass} onChange={(value) => commitParameter("bypass", value)} />
            {!nativeConnected && <>
              <ControlSlider label="INPUT TRIM" value={pluginValues.inputTrim} minimum={-24} maximum={24} step={0.1} suffix=" dB" onGestureStart={() => beginParameter("inputTrim")} onGestureEnd={() => endParameter("inputTrim")} onChange={(value) => setParameter("inputTrim", value)} />
              <ControlSlider label="OUTPUT TRIM" value={pluginValues.outputTrim} minimum={-24} maximum={12} step={0.1} suffix=" dB" onGestureStart={() => beginParameter("outputTrim")} onGestureEnd={() => endParameter("outputTrim")} onChange={(value) => setParameter("outputTrim", value)} />
              <ControlSelect label="QUALITY" value={pluginValues.quality} options={qualityOptions} onChange={(value) => commitParameter("quality", value)} />
            </>}
          </section>
        </aside>
      </section>

      <footer className="status-bar">
        <span>RAW WEBGL2 / NO THREE.JS</span>
        <span>APVTS LINK / NATIVE TELEMETRY</span>
        <span>{pluginValues.bpm.toFixed(1)} BPM / {syncDivisionOptions[pluginValues.syncDivision]}</span>
      </footer>
    </main>
  );
}

export default App;
