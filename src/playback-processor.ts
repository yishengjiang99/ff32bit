const frame = 36;
const chunk = 1024;

/* eslint-disable @typescript-eslint/no-explicit-any */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;

// Number of bytes to skip for WAV format (48 bytes covers the standard 44-byte PCM
// header plus any alignment padding, as specified by the project requirements)
const WAV_HEADER_SKIP = 48;
// RIFF magic bytes that identify WAV files
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"

class PlaybackProcessor extends AudioWorkletProcessor {
  buffers: Uint8Array[];
  started: boolean;
  loss: number;
  total: number;
  rms: number;
  totalFrames: number;
  leftPartialFrame: Uint8Array | null;
  readable: ReadableStream | null;
  bytesToSkip: number;

  constructor() {
    super();
    this.buffers = [];
    this.started = false;
    this.port.postMessage("initialized");
    this.port.onmessage = this.handleMesg.bind(this);
    this.loss = 0;
    this.total = 0;
    this.rms = 0;
    this.totalFrames = 0;
    this.leftPartialFrame = null;
    this.readable = null;
    this.bytesToSkip = 0;
  }

  handleMesg(evt: MessageEvent) {
    if (this.buffers && this.buffers.length) {
      this.buffers = [];
    }
    if (this.readable) {
      (this.readable as any).cancel();
    }
    this.started = false;
    this.bytesToSkip = 0;
    this.readable = evt.data.readable;
    const reader = (this.readable as ReadableStream<Uint8Array>).getReader();
    const that = this;
    reader.read().then(function process({ done, value }: { done: boolean; value: Uint8Array | undefined }) {
      if (done) {
        return { done: true, value };
      }
      if (!value) {
        return reader.read().then(process);
      }
      // Detect WAV format (RIFF header) on first chunk and skip header bytes
      if (that.bytesToSkip === 0 &&
          value.length >= 4 &&
          value[0] === RIFF_MAGIC[0] && value[1] === RIFF_MAGIC[1] &&
          value[2] === RIFF_MAGIC[2] && value[3] === RIFF_MAGIC[3]) {
        that.bytesToSkip = WAV_HEADER_SKIP;
      }
      if (that.bytesToSkip > 0) {
        const skip = Math.min(that.bytesToSkip, value.length);
        value = value.slice(skip);
        that.bytesToSkip -= skip;
        if (value.length === 0) {
          return reader.read().then(process);
        }
      }
      while (value.length >= chunk) {
        const b = value.slice(0, chunk);
        that.buffers.push(b);
        value = value.slice(chunk);
      }
      that.totalFrames++;
      if (that.started === false && that.buffers.length > 10) {
        that.port.postMessage({ ready: 1 });
        that.started = true;
      }
      that.leftPartialFrame = value;
      reader.read().then(process);
    });
  }

  report() {
    this.port.postMessage({
      stats: {
        rms: this.rms,
        downloaded: this.totalFrames,
        played: this.total,
        buffered: (this.buffers.length / 350).toFixed(3),
        lossPercent: ((this.loss / this.total) * 100).toFixed(2),
      },
    });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    if (this.started === false) return true;
    if (this.buffers.length === 0) {
      this.loss++;
      return true;
    }
    this.total++;
    const ob = this.buffers.shift()!;
    const fl = new Float32Array(ob.buffer);
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      for (let ch = 0; ch < 2; ch++) {
        outputs[0][ch][i] = fl[i * 2 + ch];
        sum += fl[i * 2 + ch] * fl[i * 2 + ch];
      }
    }
    this.rms = Math.sqrt(sum / 256);
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);

export { frame, chunk };
