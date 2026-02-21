import { procURL, workerURL } from "./blobURLs.js";

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
      this.worker.onmessage = (e: MessageEvent) => {
        this.dispatchEvent(new CustomEvent("progress", { detail: e.data }));
      };
      this.dispatchEvent(new Event("loaded"));
    });
  }

  async queue(url: string): Promise<void> {
    this.addEventListener(
      "loaded",
      () => {
        this.worker.postMessage({ url });
      },
      { once: true }
    );
  }

  next(): void {
    this.worker.postMessage({ cmd: "ff" });
  }
}
