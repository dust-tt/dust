import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";

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

export function readableToReadableStream<T = unknown>(
  readable: Readable
): ReadableStream<T> {
  // Track whether node:pipeline() has already piped into this readable (GCS calls pipeline()
  // inside its HTTP onResponse callback). The 'pipe' event fires on the destination synchronously
  // during pipeline() setup, after the isWritable() check passes. So destroying here is safe and
  // causes pipeline() to call onComplete(ERR_STREAM_PREMATURE_CLOSE) instead
  // of throwing ERR_STREAM_UNABLE_TO_PIPE as an uncaught exception.
  let pipeReceived = false;
  // Additive: does not replace any existing listeners on the stream.
  readable.on("pipe", () => {
    pipeReceived = true;
  });

  return new ReadableStream<T>({
    start(controller) {
      readable.on("data", (chunk) => controller.enqueue(chunk as T));
      readable.on("end", () => controller.close());
      readable.on("error", (err) => controller.error(err));
    },
    cancel() {
      readable.removeAllListeners("data");
      readable.removeAllListeners("end");
      readable.removeAllListeners("error");
      readable.removeAllListeners("pipe");
      readable.on("error", () => {});

      if (pipeReceived) {
        readable.destroy();
      } else {
        // pipeline() hasn't piped into this stream yet. Wait for 'pipe', then destroy immediately.
        // Stops the GCS transfer with zero bytes read past what was already in-flight.
        readable.once("pipe", () => readable.destroy());
        readable.resume();
      }
    },
  });
}
