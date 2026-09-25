import { procURL, workerURL } from "./blobURLs.ts";

export class FF32Play extends EventTarget {
  ctx: AudioContext;
  worklet!: AudioWorkletNode;
  worker!: Worker;
  private ready = false;
  private pendingUrl: string | null = null;

  constructor() {
    super();
    this.ctx = new AudioContext({ latencyHint: "playback" });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.dispatchEvent(new CustomEvent("error", { detail: "AudioWorklet did not load" }));
    }, 15000);

    this.ctx.audioWorklet
      .addModule(procURL)
      .then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          this.worklet = new AudioWorkletNode(this.ctx, "playback-processor", {
            outputChannelCount: [2],
          });
        } catch {
          this.worklet = new AudioWorkletNode(this.ctx, "playback-processor");
        }
        this.worklet.connect(this.ctx.destination);
        this.worker = new Worker(workerURL, { type: "module" });
        this.worker.postMessage({ port: this.worklet.port }, [this.worklet.port]);
        this.worker.onmessage = (e: MessageEvent) => {
          if (e.data?.error) {
            this.dispatchEvent(new CustomEvent("error", { detail: e.data.error }));
          }
          this.dispatchEvent(new CustomEvent("progress", { detail: e.data }));
        };
        this.worker.onerror = (e: ErrorEvent) => {
          this.dispatchEvent(new CustomEvent("error", { detail: e.message || "worker error" }));
        };
        this.ready = true;
        this.dispatchEvent(new Event("loaded"));
        if (this.pendingUrl) {
          const url = this.pendingUrl;
          this.pendingUrl = null;
          this.worker.postMessage({ url });
        }
      })
      .catch((err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const message = err instanceof Error ? err.message : String(err);
        this.dispatchEvent(new CustomEvent("error", { detail: message }));
      });
  }

  async queue(url: string): Promise<void> {
    await this.ctx.resume();
    if (this.ready && this.worker) {
      this.worker.postMessage({ url });
      return;
    }
    this.pendingUrl = url;
  }
}
