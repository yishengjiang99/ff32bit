const HTTP_PARTIAL_CONTENT = 206;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;
const chunkSize = 0xffff;

let abortController: AbortController;
let port2: MessagePort;
onmessage = ({ data: { port, url } }) => {
  if (port) {
    port2 = port;
    port2.onmessage = ({ data }) => postMessage({ data });
  }
  if (url && queueUrl && port2) {
    queueUrl(url, port2);
  }
};
async function* fetchGenerator(
  url: string,
  writable: WritableStream,
  abortController: AbortController,
  offset: number
) {
  let bytesLoaded = offset,
    totalBytes;
  while (!abortController.signal.aborted) {
    const rangeHeaderValue = `bytes=${bytesLoaded}-${bytesLoaded + chunkSize}`;
    const { body, status, headers } = await fetch(url, {
      signal: abortController.signal,
      headers: {
        "if-range": rangeHeaderValue,
      },
    });
    switch (status) {
      case HTTP_PARTIAL_CONTENT:
        bytesLoaded = bytesLoaded + chunkSize;
        body === null || body === void 0 ? void 0 : body.pipeTo(writable);
        yield bytesLoaded;
        break;
      case HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA:
      case 200:
        body === null || body === void 0 ? void 0 : body.pipeTo(writable);
        return true;
      case HTTP_PARTIAL_RANGE_NOT_SATISFIED:
        return false;
      default:
        break;
    }
    if (headers.get("Content-Length")) {
      totalBytes = headers.get("Content-Length");
    }
  }
}
function queueUrl(url: string, processorPort: MessagePort) {
  let offset = 0;
  const { writable, readable } = new TransformStream();
  if (abortController) {
    abortController.abort();
  }
  const fetchIterator = fetchGenerator(url, writable, abortController, offset);
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
