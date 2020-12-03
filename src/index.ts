///<reference path="../types.d.ts" />;

import { procURL, workerUrl } from "./playback-proc-blob";
export type PlaybackOptions = {
	nchannels: number;
	sampleRate: 44100 | 48000;
	bitdepth: 32;
};
let node: AudioWorkletNode, worker: Worker, ctx: AudioContext;
const defaultConfig: PlaybackOptions = { sampleRate: 48000, nchannels: 2, bitdepth: 32 };

export const setup = async (config: PlaybackOptions) => {
	const ctx = new AudioContext({
		sampleRate: config.sampleRate || 44100,
		latencyHint: "playback",
	});
	await ctx.audioWorklet.addModule(procURL);
	node = new AudioWorkletNode(ctx, "playback-processor", {
		outputChannelCount: [2],
	});
	node.connect(ctx.destination);

	worker = new Worker(workerUrl, { type: "module" });
	worker.postMessage({ port: node.port }, [node.port]);

	function queue(url: string) {
		worker.postMessage({ url });
	}

	function playNow(url: string) {
		worker.postMessage({ url });
	}

	function next() {
		worker.postMessage({ cmd: "ff" });
	}
	return {
		worker,
		node,
		queue,
		playNow,
		next,
	};
};
