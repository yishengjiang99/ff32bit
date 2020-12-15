import { procURL, workerURL } from "./blobURLs.js";
export type Prog = {
  msg?: string;
  stats?: {
    buffered?: number;
    lossPercent?: number;
    downloaded?: number;
    rms?: number;
  };
  ready?: boolean;
};
export class FF32Play extends EventTarget {
  ctx: AudioContext;
  worklet!: AudioWorkletNode;
  worker!: Worker;

  constructor() {
    super();
    this.ctx = new AudioContext({
      sampleRate: 48000,
      latencyHint: "playback",
    });
    this.ctx = new AudioContext();
    this.ctx.audioWorklet.addModule(procURL).then(() => {
      this.worklet = new AudioWorkletNode(this.ctx, "playback-processor", {
        outputChannelCount: [2],
      });
      this.worklet.connect(this.ctx.destination);
      this.worker = new Worker(workerURL);
      this.worker.postMessage({ port: this.worklet.port }, [this.worklet.port]);
      this.worker.onmessage = (e: { data: Prog }) => {
        this.dispatchEvent(new CustomEvent("progress", { detail: e.data }));
      };
      this.dispatchEvent(new Event("loaded"));
    });
  }

  async queue(url: string) {
    this.addEventListener(
      "loaded",
      () => {
        this.worker.postMessage({ url });
      },
      { once: true }
    );
  }
  next() {
    this.worker.postMessage({ cmd: "ff" });
  }
}
