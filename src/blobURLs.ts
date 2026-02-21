// @ts-ignore – Vite worker import; compiles TypeScript and returns the URL of the bundled output
import _procURL from "./playback-processor.ts?worker&url";
// @ts-ignore – Vite worker import; compiles TypeScript and returns the URL of the bundled output
import _workerURL from "./worker.ts?worker&url";

export const procURL: string = _procURL;
export const workerURL: string = _workerURL;
