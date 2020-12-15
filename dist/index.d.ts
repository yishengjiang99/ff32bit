export declare type Prog = {
    msg?: string;
    stats?: {
        buffered?: number;
        lossPercent?: number;
        downloaded?: number;
        rms?: number;
    };
    ready?: boolean;
};
export declare class FF32Play extends EventTarget {
    ctx: AudioContext;
    worklet: AudioWorkletNode;
    worker: Worker;
    constructor();
    queue(url: string): Promise<void>;
    next(): void;
}
