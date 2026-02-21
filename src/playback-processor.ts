const frame = 36;
const chunk = 1024;

/* eslint-disable @typescript-eslint/no-explicit-any */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;
declare const sampleRate: number;

const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WAVE_MAGIC = [0x57, 0x41, 0x56, 0x45]; // "WAVE"
const START_THRESHOLD_FRAMES = 2048;
const COMPACT_THRESHOLD_FRAMES = 4096;

type WavMeta = {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  audioFormat: number;
  dataOffset: number;
};

function concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function parseWavHeader(bytes: Uint8Array): WavMeta | null {
  if (bytes.length < 12) return null;
  if (
    bytes[0] !== RIFF_MAGIC[0] ||
    bytes[1] !== RIFF_MAGIC[1] ||
    bytes[2] !== RIFF_MAGIC[2] ||
    bytes[3] !== RIFF_MAGIC[3] ||
    bytes[8] !== WAVE_MAGIC[0] ||
    bytes[9] !== WAVE_MAGIC[1] ||
    bytes[10] !== WAVE_MAGIC[2] ||
    bytes[11] !== WAVE_MAGIC[3]
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 2;
  let fileSampleRate = 48000;
  let bitsPerSample = 32;
  let audioFormat = 3;
  let hasFmt = false;

  while (offset + 8 <= bytes.length) {
    const chunkId =
      String.fromCharCode(bytes[offset]) +
      String.fromCharCode(bytes[offset + 1]) +
      String.fromCharCode(bytes[offset + 2]) +
      String.fromCharCode(bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const nextChunkOffset = chunkDataOffset + chunkSize + (chunkSize & 1);
    if (nextChunkOffset > bytes.length) {
      return null;
    }
    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        return null;
      }
      audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      fileSampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      hasFmt = true;
    } else if (chunkId === "data") {
      if (!hasFmt || channels < 1 || fileSampleRate < 1) {
        return null;
      }
      return {
        channels,
        sampleRate: fileSampleRate,
        bitsPerSample,
        audioFormat,
        dataOffset: chunkDataOffset,
      };
    }
    offset = nextChunkOffset;
  }
  return null;
}

class PlaybackProcessor extends AudioWorkletProcessor {
  leftSamples: number[];
  rightSamples: number[];
  readPos: number;
  started: boolean;
  loss: number;
  total: number;
  rms: number;
  totalFrames: number;
  readable: ReadableStream | null;
  wavProbeBuffer: Uint8Array;
  pcmRemainder: Uint8Array;
  wavDetected: boolean | null;
  inputChannels: number;
  inputSampleRate: number;
  inputBitsPerSample: number;
  inputAudioFormat: number;
  srcToDstStep: number;

  constructor() {
    super();
    this.leftSamples = [];
    this.rightSamples = [];
    this.readPos = 0;
    this.started = false;
    this.port.postMessage("initialized");
    this.port.onmessage = this.handleMesg.bind(this);
    this.loss = 0;
    this.total = 0;
    this.rms = 0;
    this.totalFrames = 0;
    this.readable = null;
    this.wavProbeBuffer = new Uint8Array(0);
    this.pcmRemainder = new Uint8Array(0);
    this.wavDetected = null;
    this.inputChannels = 2;
    this.inputSampleRate = sampleRate;
    this.inputBitsPerSample = 32;
    this.inputAudioFormat = 3;
    this.srcToDstStep = 1;
  }

  resetStreamState() {
    this.started = false;
    this.leftSamples = [];
    this.rightSamples = [];
    this.readPos = 0;
    this.wavProbeBuffer = new Uint8Array(0);
    this.pcmRemainder = new Uint8Array(0);
    this.wavDetected = null;
    this.inputChannels = 2;
    this.inputSampleRate = sampleRate;
    this.inputBitsPerSample = 32;
    this.inputAudioFormat = 3;
    this.srcToDstStep = 1;
  }

  decodeOneSample(view: DataView, offset: number): number {
    switch (this.inputBitsPerSample) {
      case 8:
        return (view.getUint8(offset) - 128) / 128;
      case 16:
        return view.getInt16(offset, true) / 32768;
      case 24: {
        const b0 = view.getUint8(offset);
        const b1 = view.getUint8(offset + 1);
        const b2 = view.getInt8(offset + 2);
        return ((b2 << 16) | (b1 << 8) | b0) / 8388608;
      }
      case 32:
        if (this.inputAudioFormat === 3) {
          return view.getFloat32(offset, true);
        }
        return view.getInt32(offset, true) / 2147483648;
      default:
        return 0;
    }
  }

  consumePcmBytes(bytes: Uint8Array) {
    const merged = concatUint8(this.pcmRemainder, bytes);
    const bytesPerSample = Math.max(1, this.inputBitsPerSample >> 3);
    const frameBytes = Math.max(1, this.inputChannels * bytesPerSample);
    const consumable = merged.length - (merged.length % frameBytes);
    if (consumable <= 0) {
      this.pcmRemainder = merged;
      return;
    }
    const view = new DataView(merged.buffer, merged.byteOffset, consumable);
    for (let offset = 0; offset < consumable; offset += frameBytes) {
      const left = this.decodeOneSample(view, offset);
      const right = this.inputChannels > 1 ? this.decodeOneSample(view, offset + bytesPerSample) : left;
      this.leftSamples.push(left);
      this.rightSamples.push(right);
    }
    this.pcmRemainder = merged.slice(consumable);
  }

  pushChunk(value: Uint8Array) {
    if (this.wavDetected === null) {
      this.wavProbeBuffer = concatUint8(this.wavProbeBuffer, value);
      if (this.wavProbeBuffer.length >= 12) {
        const looksLikeWav =
          this.wavProbeBuffer[0] === RIFF_MAGIC[0] &&
          this.wavProbeBuffer[1] === RIFF_MAGIC[1] &&
          this.wavProbeBuffer[2] === RIFF_MAGIC[2] &&
          this.wavProbeBuffer[3] === RIFF_MAGIC[3];
        if (!looksLikeWav) {
          this.wavDetected = false;
          this.consumePcmBytes(this.wavProbeBuffer);
          this.wavProbeBuffer = new Uint8Array(0);
          return;
        }
      }
      const parsed = parseWavHeader(this.wavProbeBuffer);
      if (parsed) {
        this.wavDetected = true;
        this.inputChannels = parsed.channels === 1 ? 1 : 2;
        this.inputSampleRate = parsed.sampleRate;
        this.inputBitsPerSample = parsed.bitsPerSample;
        this.inputAudioFormat = parsed.audioFormat;
        this.srcToDstStep = this.inputSampleRate / sampleRate;
        const payload = this.wavProbeBuffer.slice(parsed.dataOffset);
        this.wavProbeBuffer = new Uint8Array(0);
        this.consumePcmBytes(payload);
      }
      return;
    }
    this.consumePcmBytes(value);
  }

  handleMesg(evt: MessageEvent) {
    this.resetStreamState();
    if (this.readable) {
      (this.readable as any).cancel();
    }
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
      that.pushChunk(value);
      that.totalFrames++;
      if (that.started === false && that.leftSamples.length > START_THRESHOLD_FRAMES) {
        that.port.postMessage({ ready: 1 });
        that.started = true;
      }
      reader.read().then(process);
    });
  }

  report() {
    this.port.postMessage({
      stats: {
        rms: this.rms,
        downloaded: this.totalFrames,
        played: this.total,
        buffered: ((this.leftSamples.length - Math.floor(this.readPos)) / sampleRate).toFixed(3),
        lossPercent: ((this.loss / this.total) * 100).toFixed(2),
      },
    });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    if (this.started === false) return true;
    const leftOut = outputs[0][0];
    const rightOut = outputs[0][1] || outputs[0][0];
    if (!leftOut || !rightOut) {
      return true;
    }
    if (this.leftSamples.length < 2) {
      this.loss++;
      for (let i = 0; i < 128; i++) {
        leftOut[i] = 0;
        rightOut[i] = 0;
      }
      return true;
    }
    this.total++;
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const idx = Math.floor(this.readPos);
      const frac = this.readPos - idx;
      const l0 = this.leftSamples[idx];
      const r0 = this.rightSamples[idx];
      const l1 = this.leftSamples[idx + 1] ?? l0;
      const r1 = this.rightSamples[idx + 1] ?? r0;
      const left = l0 + (l1 - l0) * frac;
      const right = r0 + (r1 - r0) * frac;
      leftOut[i] = left;
      rightOut[i] = right;
      sum += left * left + right * right;
      this.readPos += this.srcToDstStep;
      if (Math.floor(this.readPos) >= this.leftSamples.length - 1) {
        this.loss++;
        for (let j = i + 1; j < 128; j++) {
          leftOut[j] = 0;
          rightOut[j] = 0;
        }
        break;
      }
    }
    this.rms = Math.sqrt(sum / 256);
    const drop = Math.floor(this.readPos) - 1;
    if (drop >= COMPACT_THRESHOLD_FRAMES) {
      this.leftSamples.splice(0, drop);
      this.rightSamples.splice(0, drop);
      this.readPos -= drop;
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);

export { frame, chunk };
