type ProcessFunction = (
  rsul: ReadableStreamReadResult<Uint8Array>
) => ReadableStreamReadDoneResult<Uint8Array>;
const frame = 36;
const chunk = 1024;
/* @ts-ignore */
class PlaybackProcessor /* @ts-ignore */ extends AudioWorkletProcessor {
  buffers: Uint8Array[];
  started: boolean;
  port!: MessagePort;
  loss: number;
  total: number;
  rms: number;
  readable!: ReadableStream<Uint8Array>;
  leftPartialFrame: Uint8Array | null;
  constructor() {
    super();
    this.buffers = [];
    this.started = false;
    this.port.postMessage("initialized");
    this.port.onmessage = this.handleMesg.bind(this);
    this.loss = 0;
    this.total = 0;
    this.rms = 0;
    this.leftPartialFrame = null;
  }
  handleMesg(evt: MessageEvent) {
    this.readable = evt.data.readable;
    let reader = this.readable.getReader();
    reader.read().then(function process(this: any, { done, value }): any {
      if (done) {
        return { done: true, value };
      }
      if (!value) {
        return reader.read().then(process);
      }

      while (value.length >= chunk) {
        const b = value.slice(0, chunk);
        this.buffers.push(b);
        value = value.slice(chunk);
      }
      if (this.started === false && this.buffers.length > 10) {
        this.port.postMessage({ ready: 1 });
        this.started = true;
      }
      this.leftPartialFrame = value;
      reader.read().then(process);
    });
  }

  report() {
    this.port.postMessage({
      stats: {
        rms: this.rms,
        buffered: (this.buffers.length / 350).toFixed(3),
        lossPercent: ((this.loss / this.total) * 100).toFixed(2),
      },
    });
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: { [key: string]: Float32Array[] }
  ) {
    if (this.started === false) return true;

    if (this.buffers.length === 0) {
      this.loss++;
      return true;
    }
    this.total++;

    const ob = this.buffers.shift();
    const fl = new Float32Array(ob!.buffer);
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
// @ts-ignore
registerProcessor("playback-processor", PlaybackProcessor);
