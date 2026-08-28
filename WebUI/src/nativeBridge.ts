export type NativeParameterRow = {
  id: string;
  name?: string;
  value: number;
  text?: string;
  default?: number;
};

export type SpeakerProfile = {
  id: string;
  name: string;
  description: string;
  lowCut: number;
  highCut: number;
  lowGain: number;
  midGain: number;
  highGain: number;
};

export type NativeState = {
  protocol?: number;
  type?: string;
  product?: string;
  bpm?: number;
  parameters?: NativeParameterRow[];
  speakerProfiles?: SpeakerProfile[];
  program?: number;
  programName?: string;
  programNames?: string[];
  programCount?: number;
};

export type NativeTelemetry = {
  rotorPhase?: number;
  rotorRate?: number;
  direction?: number;
  audioSequence?: number;
  bpm?: number;
  inputPeak?: number;
  outputPeak?: number;
  bands?: number[];
  playing?: boolean;
};

type NativeBackend = {
  addEventListener: (eventId: string, listener: (payload: unknown) => void) => number;
  removeEventListener: (token: number) => void;
  emitEvent: (eventId: string, payload: unknown) => void;
};

type JuceRuntime = {
  backend: NativeBackend;
};

declare global {
  interface Window {
    __JUCE__?: JuceRuntime;
  }
}

function getBackend(): NativeBackend | undefined {
  return window.__JUCE__?.backend;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteProfileNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}

function parseSpeakerProfiles(value: unknown): SpeakerProfile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Partial<SpeakerProfile>;
    if (typeof source.id !== "string" || typeof source.name !== "string") return [];
    return [{
      id: source.id,
      name: source.name,
      description: typeof source.description === "string" ? source.description : "",
      lowCut: finiteProfileNumber(source.lowCut, 0.015, 0, 1),
      highCut: finiteProfileNumber(source.highCut, 0.24, 0, 1),
      lowGain: finiteProfileNumber(source.lowGain, 1, 0, 4),
      midGain: finiteProfileNumber(source.midGain, 1, 0, 4),
      highGain: finiteProfileNumber(source.highGain, 1, 0, 4),
    }];
  });
}

function parseState(payload: unknown): NativeState | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const state = payload as NativeState;
  if (!Array.isArray(state.parameters)) return undefined;
  const programCount = Math.max(1, Math.round(finiteNumber(state.programCount, 8)));
  const program = Math.min(programCount - 1, Math.max(0, Math.round(finiteNumber(state.program, 0))));
  const programNames = Array.isArray(state.programNames)
    ? state.programNames.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];
  return {
    ...state,
    bpm: Math.min(300, Math.max(20, finiteNumber(state.bpm, 120))),
    program,
    programName: typeof state.programName === "string" && state.programName.trim().length > 0
      ? state.programName
      : `Program ${program + 1}`,
    programNames,
    programCount,
    parameters: state.parameters
      .filter((row): row is NativeParameterRow => Boolean(row && typeof row.id === "string"))
      .map((row) => ({ ...row, value: Math.min(1, Math.max(0, finiteNumber(row.value))) })),
    speakerProfiles: parseSpeakerProfiles(state.speakerProfiles),
  };
}

function parseTelemetry(payload: unknown): NativeTelemetry | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const telemetry = payload as NativeTelemetry;
  return {
    rotorPhase: finiteNumber(telemetry.rotorPhase),
    rotorRate: finiteNumber(telemetry.rotorRate),
    direction: finiteNumber(telemetry.direction),
    audioSequence: Math.max(0, Math.floor(finiteNumber(telemetry.audioSequence))),
    bpm: Math.min(300, Math.max(20, finiteNumber(telemetry.bpm, 120))),
    inputPeak: Math.min(1, Math.max(0, finiteNumber(telemetry.inputPeak))),
    outputPeak: Math.min(1, Math.max(0, finiteNumber(telemetry.outputPeak))),
    bands: Array.isArray(telemetry.bands)
      ? telemetry.bands.slice(0, 3).map((value) => Math.max(0, finiteNumber(value)))
      : [],
    playing: telemetry.playing === true,
  };
}

export class NativeBridge {
  readonly available: boolean;

  private readonly backend?: NativeBackend;
  private readonly completionToken?: number;
  private nextResultId = 1;
  private readonly pending = new Map<number, (result: unknown) => void>();
  private eventTokens: number[] = [];

  constructor(
    private readonly onState: (state: NativeState) => void,
    private readonly onTelemetry: (telemetry: NativeTelemetry) => void,
    private readonly onNotice?: (notice: unknown) => void,
  ) {
    this.backend = getBackend();
    this.available = this.backend !== undefined;
    if (!this.backend) return;

    this.completionToken = this.backend.addEventListener("__juce__complete", (payload) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as { promiseId?: unknown; result?: unknown };
      const promiseId = finiteNumber(data.promiseId, -1);
      const resolve = this.pending.get(promiseId);
      if (!resolve) return;
      this.pending.delete(promiseId);
      resolve(data.result);
    });

    this.eventTokens.push(
      this.backend.addEventListener("state", (payload) => {
        const state = parseState(payload);
        if (state) this.onState(state);
      }),
      this.backend.addEventListener("telemetry", (payload) => {
        const telemetry = parseTelemetry(payload);
        if (telemetry) this.onTelemetry(telemetry);
      }),
    );

    if (this.onNotice) {
      this.eventTokens.push(this.backend.addEventListener("notice", this.onNotice));
    }
  }

  connect() {
    if (!this.backend) return;
    void this.call("uiReady");
  }

  parameterGesture(id: string, phase: "begin" | "set" | "end", value: number) {
    if (!this.backend || !id || !Number.isFinite(value)) return;
    void this.call("parameter", {
      id,
      phase,
      value: Math.min(1, Math.max(0, value)),
    });
  }

  program(index: number) {
    if (!this.backend || !Number.isFinite(index)) return;
    void this.call("program", { index: Math.round(index) });
  }

  previousProgram() {
    if (!this.backend) return;
    void this.call("previousProgram");
  }

  nextProgram() {
    if (!this.backend) return;
    void this.call("nextProgram");
  }

  savePreset() {
    if (!this.backend) return;
    void this.call("savePreset");
  }

  openPreset() {
    if (!this.backend) return;
    void this.call("openPreset");
  }

  dispose() {
    if (!this.backend) return;
    this.eventTokens.forEach((token) => this.backend?.removeEventListener(token));
    this.eventTokens = [];
    if (this.completionToken !== undefined) this.backend.removeEventListener(this.completionToken);
    this.pending.clear();
  }

  private call(type: string, properties: Record<string, unknown> = {}) {
    if (!this.backend) return Promise.resolve(undefined);
    const resultId = this.nextResultId++;
    const result = new Promise<unknown>((resolve) => this.pending.set(resultId, resolve));
    this.backend.emitEvent("__juce__invoke", {
      name: "rotatorCommand",
      params: [JSON.stringify({ type, ...properties })],
      resultId,
    });
    return result;
  }
}
