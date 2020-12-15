export const procURL = URL.createObjectURL(
  new Blob(
    [
      `const frame = 36;
const chunk = 1024;
/* @ts-ignore */
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = [];
    this.started = false;
    this.port.postMessage("initialized");
    this.port.onmessage = this.handleMesg.bind(this);
    this.loss = 0;
    this.total = 0;
    this.rms = 0;
    this.leftPartialFrame = null;
  }
  handleMesg(evt) {
    if(this.buffers && this.buffers.length){
      this.buffers = [];
    }
    if(this.readable){
      this.readable.cancel();
    }
    this.started=false;
    this.readable = evt.data.readable;
    let reader = this.readable.getReader();
    let that = this;
    reader.read().then(function process({ done, value }) {
      if (done) {
        return { done: true, value };
      }
      if (!value) {
        return reader.read().then(process);
      }
      while (value.length >= chunk) {
        const b = value.slice(0, chunk);
        that.buffers.push(b);
        value = value.slice(chunk);
      }
      that.totalFrames++;
      if (that.started === false && that.buffers.length > 10) {
        that.port.postMessage({ ready: 1 });
        that.started = true;
      }

      that.leftPartialFrame = value;
      reader.read().then(process);
    });
  }
  report() {
    this.port.postMessage({
      stats: {
        rms: this.rms,
        downloaded: this.totalFrames,
        played: this.total,
        buffered: (this.buffers.length / 350).toFixed(3),
        lossPercent: ((this.loss / this.total) * 100).toFixed(2),
      },
    });
  }
  process(inputs, outputs, parameters) {
    if (this.started === false) return true;
    if (this.buffers.length === 0) {
      this.loss++;
      return true;
    }
    this.total++;
    const ob = this.buffers.shift();
    const fl = new Float32Array(ob.buffer);
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      for (let ch = 0; ch < 2; ch++) {
        outputs[0][ch][i] = fl[i * 2 + ch];
        sum += fl[i * 2 + ch] * fl[i * 2 + ch];
      }
    }
    this.rms = Math.sqrt(sum / 256);
    return true;
  }
}
registerProcessor("playback-processor", PlaybackProcessor);`,
    ],
    { type: "application/javascript" }
  )
);
export const workerURL = URL.createObjectURL(
  new Blob(
    [
      `"use strict";
    const HTTP_PARTIAL_CONTENT = 206;
    const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
    const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;
    const chunkSize = 0xffff;
    let abortController;
    let port2;
    onmessage = ({ data: { port, url } }) => {
        if (port) {
            port2 = port;
            port2.onmessage = ({ data }) => postMessage({ data });
        }
        if (url && queueUrl && port2) {
            queueUrl(url, port2);
        }
    };
    async function* fetchGenerator(url, writable, abortController, offset) {
        let bytesLoaded = offset, totalBytes;
        while (!abortController.signal.aborted) {
            const rangeHeaderValue = "bytes=" + bytesLoaded + "-" + (bytesLoaded + chunkSize);
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
    function queueUrl(url, processorPort) {
        let offset = 0;
        const { writable, readable } = new TransformStream();
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();
        const fetchIterator = fetchGenerator(url, writable, abortController, offset);
        (async function () {
            fetchIterator.next().then(function process({ done, value }) {
                if (done) {
                    return;
                }
                else {
                    fetchIterator.next().then(process);
                }
            });
        })();
        //@ts-ignore
        if (processorPort)
            processorPort.postMessage({ readable }, [readable]);
        return readable;
    }
    
`,
    ],
    { type: "application/javascript" }
  )
);
