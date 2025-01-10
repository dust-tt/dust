import { Readable } from "stream";

/**
 * This file contains utility functions for converting between different stream types.
 *
 * The two main functions are:
 *
 * 1. readableToReadableStream: Converts a Node.js Readable stream to a Web API ReadableStream.
 *    This is useful when working with APIs or environments that expect Web Streams.
 *
 * 2. readableStreamToReadable: Converts a Web API ReadableStream to a Node.js Readable stream.
 *    This allows for compatibility with Node.js stream-based APIs and operations.
 *
 * These functions enable seamless interoperability between Node.js streams and Web Streams,
 * facilitating data processing across different stream implementations.
 */

// Define a type for the RequestInit object with duplex set to "half" because the official types are lagging behind
export interface RequestInitWithDuplex extends RequestInit {
  duplex: "half";
}

export function readableToReadableStream(readable: Readable) {
  return new ReadableStream({
    start(controller) {
      readable.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      readable.on("end", () => {
        controller.close();
      });
      readable.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      readable.destroy();
    },
  });
}

export function readableStreamToReadable(readableStream: ReadableStream) {
  const reader = readableStream.getReader();
  let reading = false;

  return new Readable({
    read() {
      if (reading) {
        return;
      } // Prevent concurrent reads

      reading = true;
      reader.read().then(
        ({ done, value }) => {
          reading = false;
          if (done) {
            this.push(null);
          } else {
            // Only request more data if push() returns true
            // This properly implements backpressure
            if (!this.push(value)) {
              reading = true; // Pause reading until more data is requested
            }
          }
        },
        (error) => {
          reading = false;
          this.destroy(error);
        }
      );
    },
  });
}
