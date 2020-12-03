import { PlaybackOptions, MessageProps, Queue } from "types.js";

const HTTP_PARTIAL_CONTENT = 206;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;

export const fetchLoader = (
  sampleRate: number = 44100,
  port2?: MessagePort
) => {
  const queue: Queue = [];
  const fetchGenerator = async function* (
    queue: Queue,
    writable: WritableStream<Uint8Array>
  ) {
    let bytesLoaded = 0;
    while (queue.length) {
      const { url, start, end } = queue.shift()!;
      const { body, status } = await fetch(url, {
        headers: {
          "if-range": `Bytes=${start}-${end || ""}`,
        },
      });
      switch (status) {
        case HTTP_PARTIAL_CONTENT:
          bytesLoaded = end || 100;
          body?.pipeTo(writable);
          yield;
          break;
        case HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA:
        case 200:
          body?.pipeTo(writable);
          while (queue[0] && queue[0].url === url) queue.shift();
          return;
        case HTTP_PARTIAL_RANGE_NOT_SATISFIED:
          queue.unshift({ url, start: bytesLoaded, end: "" });
          break;
        default:
          break;
      }
    }
  };
  function queueUrl(url: string) {
    let offset = 0;
    const { writable, readable } = new TransformStream();
    if (url) {
      [1 / 2, 1, 3, 5, 10].map((byteRange) => {
        const start = offset;
        const end = start + byteRange * _config.sampleRate;
        offset = end;
        queue.push({ url, start, end });
        return `bytes=${start}-${end}`; // - (offset + byteRange * config.sampleRate)}`;
      });
    }
    console.log("before loop");
    (async () => {
      console.log("yn async");
      for await (const _ of fetchGenerator(queue, writable)) {
        console.log("yn asyncloop");
      }
    })();
    console.log("sharing port");
    //@ts-ignore
    if (port2) port2.postMessage({ readable }, [readable]);
    return readable;
  }
  return {
    queueUrl,
  };
};

let port2: MessagePort;
let _config: PlaybackOptions = {
  nchannels: 2,
  sampleRate: 44100,
  bitdepth: 32,
};

onmessage = ({ data: { port, url, cmd, stats, ready } }: MessageProps) => {
  let queueUrl;
  if (port) {
    port2 = port;
    queueUrl = fetchLoader(_config.sampleRate, port2).queueUrl;
  }

  if (url && queueUrl) {
    queueUrl(url);
  }
  postMessage({ cmd, stats, ready });
};
