/// <reference types="node" />
import { Readable } from "stream";
export interface RequestInitWithDuplex extends RequestInit {
    duplex: "half";
}
export declare function readableStreamToReadable<T = unknown>(webStream: ReadableStream<T>): Readable;
//# sourceMappingURL=streams.d.ts.map