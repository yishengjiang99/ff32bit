const HTTP_PARTIAL_CONTENT = 206;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;
const chunkSize = 0xffff;

async function* fetchGenerator(
  url: string,
  writable: WritableStream<Uint8Array>
) {
  let bytesLoaded = 0;

  while (true) {
    const { body, status, headers } = await fetch(url, {
      headers: {
        "if-range": `bytes=${bytesLoaded}-${bytesLoaded + chunkSize}`,
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
  }
}
export function queueUrl(url: string, processorPort: MessagePort) {
  let offset = 0;
  const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();

  const fetchIterator = fetchGenerator(url, writable);
  (async function () {
    fetchIterator.next().then(function process({ done, value }) {
      if (done) {
        return;
      } else {
        fetchIterator.next().then(process);
      }
    });
  })();

  //@ts-ignore
  if (processorPort) processorPort.postMessage({ readable }, [readable]);
  return readable;
}

const ctx: Worker = self as any;

let port2: MessagePort;
const postMessage = ctx.postMessage;
ctx.onmessage = ({ data: { port, url, cmd, stats, ready } }) => {
  if (port) {
    port2 = port;
    port2.onmessage = ({ data }) => postMessage({ data });
  }

  if (url && queueUrl) {
    queueUrl(url, port2);
  }
};
