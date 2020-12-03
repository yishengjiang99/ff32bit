export const procURL = URL.createObjectURL(
	new Blob(
		[
			`const frame = 36;
const chunk = 1024;

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = [];
    this.started = false;
    this.port.postMessage("initialized");
    this.port.onmessage = this.handleMesg.bind(this);
    this.rptr = 0;
    this.loss = 0;
    this.total = 0;
    this.rms = 0;
  }
  handleMesg(evt) {
    this.readable = evt.data.readable;
    let reader = this.readable.getReader();
    let that = this;
    reader.read().then(function process({ done, value }) {
      if (done) {
        that.port.postMessage({ done: 1 });
        return;
      }
      let offset = 0;
      value &&
        that.port.postMessage({stats:
          {
            rms: that.rms,
            buffered: (that.buffers.length / 350).toFixed(3),
            lossPercent: ((that.loss / that.total) * 100).toFixed(2)
          }
        });
      while (value.length >= chunk) {
        const b = value.slice(0, chunk);
        that.buffers.push(b);
        value = value.slice(chunk);
      }
      if (that.started === false && that.buffers.length > 10) {
        that.port.postMessage({ ready: 1 });
        that.started = true;
      }
      reader.read().then(process);
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
registerProcessor("playback-processor", PlaybackProcessor);
`,
		],
		{ type: "application/javascript" }
	)
);

export const workerUrl = URL.createObjectURL(
	new Blob([
		`const HTTP_PARTIAL_CONTENT = 206;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;
export const fetchLoader = (sampleRate = 44100, port2) => {
    const queue = [];
    const fetchGenerator = async function* (queue, writable) {
        let bytesLoaded = 0;
        while (queue.length) {
            const { url, start, end } = queue.shift();
            const { body, status } = await fetch(url, {
                headers: {
                    "if-range": "Bytes="+start+"-"+end
                },
            });
            switch (status) {
                case HTTP_PARTIAL_CONTENT:
                    bytesLoaded = end || 100;
                    body === null || body === void 0 ? void 0 : body.pipeTo(writable);
                    break;
                case HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA:
                case 200:
                    body === null || body === void 0 ? void 0 : body.pipeTo(writable);
                    while (queue[0] && queue[0].url === url)
                        queue.shift();
                    break;
                case HTTP_PARTIAL_RANGE_NOT_SATISFIED:
                    debugger;
                    queue.unshift({ url, start: bytesLoaded, end: "" });
                    break;
                default:
                    break;
            }
        }
    };
    function queueUrl(url) {
        let offset = 0;
        const { writable, readable } = new TransformStream();
        if (url) {
            [1 / 2, 1, 3, 5, 10].map((byteRange) => {
                const start = offset;
                const end = start + byteRange * _config.sampleRate;
                offset = end;
                queue.push({ url, start, end });
            });
        }

        (async () => {

            for await (const _ of await fetchGenerator(queue, writable)) ;
        })();

        if (port2)
            port2.postMessage({ readable }, [readable]);
        return readable;
    }
    return {
        queueUrl,
    };
};
let port2;
let _config = {
    nchannels: 2,
    sampleRate: 44100,
    bitdepth: 32,
};
onmessage = ({ data: { port, url, cmd, stats, ready } }) => {
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
//# sourceMappingURL=playback-worker.js.map`,
	])
);
