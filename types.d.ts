export type keyvalue<T, S> = { T: S };
export type MessageProps = {
  data: {
    config?: PlaybackOptions;
    port?: MessagePort;
    url?: string;
    cmd?: string;
    msg?: string;
    stats?: keyvalue<string, number>[];
    ready: 1;
  };
};
export type PlaybackOptions = {
  nchannels: number;
  sampleRate: 44100 | 48000;
  bitdepth: 32;
};
export type ByteOffset = number;
export type Queue = { url: string; start: ByteOffset; end: ByteOffset | "" }[];
export type SetupFunction = (
  config: PlaybackOptions
) => {
  worker: Worker;
  node: AudioWorkletNode;
  queue: (url: string) => void;
  playNow: (url: string) => void;
  next: () => void;
};
declare module "worker-loader!*" {
  // You need to change `Worker`, if you specified a different value for the `workerType` option
  class WebpackWorker extends Worker {
    constructor();
  }

  // Uncomment this if you set the `esModule` option to `false`
  // export = WebpackWorker;
  export default WebpackWorker;
}
