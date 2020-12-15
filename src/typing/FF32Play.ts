export namespace FF32Play {
  declare type Prog = {
    msg?: string;
    stats?: {
      buffered?: number;
      lossPercent?: number;
      downloaded?: number;
      rms?: number;
    };
    ready?: boolean;
  };
}
