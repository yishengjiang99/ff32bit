declare const HTTP_PARTIAL_CONTENT = 206;
declare const HTTP_PARTIAL_RANGE_NOT_SATISFIED = 406;
declare const HTTP_PARTIAL_RANGE_NOT_SATISFIED_BUT_HERES_SOME_DATA = 416;
declare const chunkSize = 65535;
declare let abortController: AbortController;
declare let port2: MessagePort;
declare function fetchGenerator(url: string, writable: WritableStream, abortController: AbortController, offset: number): AsyncGenerator<number, boolean | undefined, unknown>;
declare function queueUrl(url: string, processorPort: MessagePort): ReadableStream<any>;
