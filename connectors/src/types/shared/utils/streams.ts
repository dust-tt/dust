import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

// Define a type for the RequestInit object with duplex set to "half" because the official types are
// lagging behind.
export interface RequestInitWithDuplex extends RequestInit {
  duplex: "half";
}

export function readableStreamToReadable<T = unknown>(
  webStream: ReadableStream<T>
): Readable {
  return Readable.fromWeb(webStream as NodeReadableStream<T>);
}
