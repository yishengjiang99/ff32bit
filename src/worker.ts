"use strict";

const CHUNK_SIZE = 64 * 1024;

let abortController: AbortController | undefined;
let port2: MessagePort | undefined;

onmessage = ({ data: { port, url } }: MessageEvent<{ port?: MessagePort; url?: string }>) => {
  if (port) {
    port2 = port;
    port2.onmessage = ({ data }: MessageEvent) => postMessage({ data });
  }
  if (url && port2) {
    queueUrl(url, port2);
  }
};

function totalFromContentRange(header: string | null): number | null {
  if (!header) return null;
  const total = header.split("/")[1];
  if (!total || total === "*") return null;
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

async function writeBody(
  body: ReadableStream<Uint8Array> | null,
  writer: WritableStreamDefaultWriter<Uint8Array>
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) await writer.write(value);
  }
}

async function streamUrl(
  url: string,
  writable: WritableStream<Uint8Array>,
  controller: AbortController
): Promise<void> {
  const writer = writable.getWriter();
  let offset = 0;
  try {
    while (!controller.signal.aborted) {
      const end = offset + CHUNK_SIZE - 1;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Range: `bytes=${offset}-${end}` },
      });

      if (res.status === 206) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength === 0) break;
        await writer.write(buf);
        offset += buf.byteLength;
        const total = totalFromContentRange(res.headers.get("Content-Range"));
        if ((total != null && offset >= total) || buf.byteLength < CHUNK_SIZE) break;
        continue;
      }

      if (res.status === 200) {
        await writeBody(res.body, writer);
        break;
      }

      if (res.status === 416) break;

      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    await writer.close();
  } catch (err) {
    try {
      await writer.abort(err);
    } catch {
      /* writer already closed */
    }
    throw err;
  }
}

function pumpToPort(
  port: MessagePort,
  readable: ReadableStream<Uint8Array>,
  controller: AbortController
): void {
  port.postMessage({ reset: true });
  const reader = readable.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        const copy = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        port.postMessage({ chunk: copy }, [copy]);
      }
      port.postMessage({ done: true });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      postMessage({ error: message });
    }
  })();
}

function deliver(
  port: MessagePort,
  readable: ReadableStream<Uint8Array>,
  controller: AbortController
): void {
  try {
    // Chromium and Firefox can hand the stream to the worklet.
    // Safari throws DataCloneError until transferable streams ship, so copy via ArrayBuffers.
    port.postMessage({ readable }, [readable]);
  } catch {
    pumpToPort(port, readable, controller);
  }
}

function queueUrl(url: string, processorPort: MessagePort): void {
  if (abortController) abortController.abort();
  const controller = new AbortController();
  abortController = controller;
  const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();
  streamUrl(url, writable, controller).catch((err) => {
    if (controller.signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ error: message });
  });
  deliver(processorPort, readable, controller);
}
