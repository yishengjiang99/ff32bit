# ff32bit

Streaming WAV player built with Vite, a `Worker`, and an `AudioWorklet`.

## What it does

- Streams audio bytes from a URL in a Web Worker.
- Pipes streamed bytes into an AudioWorklet processor.
- Parses WAV headers (`RIFF`/`WAVE`) instead of blindly skipping bytes.
- Detects and handles:
  - mono vs stereo
  - source sample rate
  - common PCM/float bit depths
- Resamples in the processor when source sample rate differs from the audio context.

## Run locally

Requirements:

- Node.js 18+
- npm

Install and start dev server:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Project structure

- `src/ffplayer.ts`: public player class (`FF32Play`) that wires the worker + worklet.
- `src/worker.ts`: fetch/stream worker that transfers a `ReadableStream`.
- `src/playback-processor.ts`: AudioWorklet processor that parses WAV metadata and outputs stereo frames.
- `src/blobURLs.ts`: Vite worker URL imports.
- `index.html`: simple demo page.

## Usage

From browser code:

```ts
import { FF32Play } from "./src/ffplayer.ts";

const player = new FF32Play();
player.queue("/file_example_WAV_10MG.wav");
```

`FF32Play` dispatches:

- `loaded`: worker/worklet pipeline ready
- `progress`: forwarded worker/worklet progress payloads

## Notes

- Worker is created as an ES module (`new Worker(url, { type: "module" })`).
- `public/file_example_WAV_10MG.wav` is included as demo content for local testing.
