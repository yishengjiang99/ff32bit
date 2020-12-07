///<reference path="../types.d.ts" />;

import Worker from "worker-loader!./Worker";

import { PlaybackOptions } from "../types";
export class Float32Radio {
  static defaultConfig: PlaybackOptions = {
    sampleRate: 48000,
    nchannels: 2,
    bitdepth: 32,
  };
  ctx: AudioContext;
  worklet!: AudioWorkletNode;
  worker!: Worker;

  constructor(config: PlaybackOptions = Float32Radio.defaultConfig) {
    this.ctx = new AudioContext({
      sampleRate: config.sampleRate || 44100,
      latencyHint: "playback",
    });
    this.setup.bind(this);
  }
  async setup() {
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule("./proc");
    this.worklet = new AudioWorkletNode(this.ctx, "playback-processor", {
      outputChannelCount: [2],
    });
    this.worklet.connect(this.ctx.destination);
    this.worker = new Worker();
    this.worker.postMessage({ port: this.worklet.port }, [this.worklet.port]);
    this.worker.onmessage = ({ data }) => console.log(data);
    this.worklet.onprocessorerror = console.log;
  }
  queue(url: string) {
    this.worker.postMessage({ url });
  }

  playNow(url: string) {
    this.worker.postMessage({ url });
  }

  next() {
    this.worker.postMessage({ cmd: "ff" });
  }
}
