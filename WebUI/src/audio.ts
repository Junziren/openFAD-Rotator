import type { AudioFrame } from "./scene";

export type AudioMode = "idle" | "demo" | "file" | "microphone";

export class AudioReactiveEngine {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private frequencyData?: Uint8Array<ArrayBuffer>;
  private timeData?: Uint8Array<ArrayBuffer>;
  private cleanup: Array<() => void> = [];
  private smoothed: AudioFrame = { low: 0, mid: 0, high: 0, peak: 0 };
  private currentMode: AudioMode = "idle";

  get mode() {
    return this.currentMode;
  }

  async startDemo() {
    await this.stop();
    const context = await this.ensureContext();
    const analyser = this.createAnalyser(context);
    const output = context.createGain();
    output.gain.value = 0.08;
    analyser.connect(output).connect(context.destination);

    const bass = context.createOscillator();
    const bassGain = context.createGain();
    bass.type = "sine";
    bass.frequency.value = 82;
    bassGain.gain.value = 0.48;
    bass.connect(bassGain).connect(analyser);

    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.value = 920;
    shimmerGain.gain.value = 0.22;
    shimmer.connect(shimmerGain).connect(analyser);

    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.frequency.value = 0.31;
    lfoDepth.gain.value = 0.16;
    lfo.connect(lfoDepth).connect(bassGain.gain);

    bass.start();
    shimmer.start();
    lfo.start();
    this.cleanup.push(() => bass.stop(), () => shimmer.stop(), () => lfo.stop(), () => output.disconnect());
    this.currentMode = "demo";
  }

  async startFile(file: File) {
    await this.stop();
    const context = await this.ensureContext();
    const analyser = this.createAnalyser(context);
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const source = context.createBufferSource();
    const output = context.createGain();
    output.gain.value = 0.72;
    source.buffer = buffer;
    source.loop = true;
    source.connect(analyser).connect(output).connect(context.destination);
    source.start();
    this.cleanup.push(() => source.stop(), () => output.disconnect());
    this.currentMode = "file";
  }

  async startMicrophone() {
    await this.stop();
    const context = await this.ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const analyser = this.createAnalyser(context);
    const source = context.createMediaStreamSource(stream);
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(analyser).connect(silent).connect(context.destination);
    this.cleanup.push(
      () => source.disconnect(),
      () => silent.disconnect(),
      () => stream.getTracks().forEach((track) => track.stop()),
    );
    this.currentMode = "microphone";
  }

  async stop() {
    this.cleanup.splice(0).forEach((dispose) => {
      try {
        dispose();
      } catch {
        // A source may already be stopped after reaching its natural end.
      }
    });
    this.analyser?.disconnect();
    this.analyser = undefined;
    this.frequencyData = undefined;
    this.timeData = undefined;
    this.currentMode = "idle";
    this.smoothed = { low: 0, mid: 0, high: 0, peak: 0 };
  }

  readFrame(): AudioFrame {
    const analyser = this.analyser;
    const frequencyData = this.frequencyData;
    const timeData = this.timeData;
    if (!analyser || !frequencyData || !timeData || !this.context) {
      this.smoothed.low *= 0.92;
      this.smoothed.mid *= 0.92;
      this.smoothed.high *= 0.92;
      this.smoothed.peak *= 0.88;
      return { ...this.smoothed };
    }

    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeData);
    const nyquist = this.context.sampleRate / 2;
    const binHz = nyquist / frequencyData.length;
    const averageBand = (from: number, to: number) => {
      const start = Math.max(0, Math.floor(from / binHz));
      const end = Math.min(frequencyData.length - 1, Math.ceil(to / binHz));
      let total = 0;
      let count = 0;
      for (let index = start; index <= end; index += 1) {
        total += frequencyData[index];
        count += 1;
      }
      return Math.pow(total / Math.max(1, count) / 255, 0.72);
    };

    let peak = 0;
    for (const sample of timeData) peak = Math.max(peak, Math.abs(sample - 128) / 128);
    const next = {
      low: averageBand(35, 240),
      mid: averageBand(240, 2200),
      high: averageBand(2200, 12000),
      peak,
    };
    this.smoothed.low += (next.low - this.smoothed.low) * 0.18;
    this.smoothed.mid += (next.mid - this.smoothed.mid) * 0.18;
    this.smoothed.high += (next.high - this.smoothed.high) * 0.18;
    this.smoothed.peak = Math.max(next.peak, this.smoothed.peak * 0.88);
    return { ...this.smoothed };
  }

  private async ensureContext() {
    if (!this.context) this.context = new AudioContext({ latencyHint: "interactive" });
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  private createAnalyser(context: AudioContext) {
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -92;
    analyser.maxDecibels = -12;
    this.analyser = analyser;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);
    return analyser;
  }
}
