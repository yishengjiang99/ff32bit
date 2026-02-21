"use strict";

const HTTP_PARTIAL_CONTENT = 206;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;
const chunkSize = 0xffff;

let abortController: AbortController | undefined;
let port2: MessagePort | undefined;

onmessage = ({ data: { port, url } }: MessageEvent<{ port?: MessagePort; url?: string }>) => {
  if (port) {
    port2 = port;
    port2.onmessage = ({ data }: MessageEvent) => postMessage({ data });
  }
  if (url && queueUrl && port2) {
    queueUrl(url, port2);
  }
};

async function* fetchGenerator(
  url: string,
  writable: WritableStream<Uint8Array>,
  controller: AbortController,
  offset: number
): AsyncGenerator<number, boolean, unknown> {
  let bytesLoaded = offset;
  while (!controller.signal.aborted) {
    const rangeHeaderValue = "bytes=" + bytesLoaded + "-" + (bytesLoaded + chunkSize);
    const { body, status, headers } = await fetch(url, {
      signal: controller.signal,
      headers: {
        "if-range": rangeHeaderValue,
      },
    });
    switch (status) {
      case HTTP_PARTIAL_CONTENT:
        bytesLoaded = bytesLoaded + chunkSize;
        body?.pipeTo(writable);
        yield bytesLoaded;
        break;
      case HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA:
      case 200:
        body?.pipeTo(writable);
        return true;
      case HTTP_PARTIAL_RANGE_NOT_SATISFIED:
        return false;
      default:
        break;
    }
    if (headers.get("Content-Length")) {
      // totalBytes available via headers.get("Content-Length")
    }
  }
  return false;
}

function queueUrl(url: string, processorPort: MessagePort): ReadableStream<Uint8Array> {
  const offset = 0;
  const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();
  const fetchIterator = fetchGenerator(url, writable, abortController, offset);
  (async function () {
    fetchIterator.next().then(function process({ done }: IteratorResult<number, boolean>): void {
      if (done) {
        return;
      } else {
        fetchIterator.next().then(process);
      }
    });
  })();
  // @ts-ignore – ReadableStream is transferable but TypeScript's MessagePort overloads don't model it
  if (processorPort) processorPort.postMessage({ readable }, [readable]);
  return readable;
}
