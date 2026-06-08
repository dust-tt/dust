import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";

import { readableToReadableStream } from "./streams";

describe("readableToReadableStream", () => {
  it("streams data chunks to the web ReadableStream", async () => {
    const readable = new PassThrough();
    const webStream = readableToReadableStream<Buffer>(readable);
    const reader = webStream.getReader();

    readable.push(Buffer.from("hello"));
    readable.push(Buffer.from(" world"));
    readable.push(null);

    const chunks: Buffer[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
    }

    expect(Buffer.concat(chunks).toString()).toBe("hello world");
  });

  it("propagates stream errors to the controller", async () => {
    const readable = new PassThrough();
    const webStream = readableToReadableStream(readable);
    const reader = webStream.getReader();

    const boom = new Error("GCS read error");
    readable.destroy(boom);

    await expect(reader.read()).rejects.toThrow("GCS read error");
  });

  it("destroys the readable immediately when cancelled after pipe event", async () => {
    const readable = new PassThrough();
    const webStream = readableToReadableStream(readable);

    // Simulate GCS having already called pipeline() — 'pipe' fires after our
    // listener is registered.
    readable.emit("pipe");

    const reader = webStream.getReader();
    await reader.cancel();

    expect(readable.destroyed).toBe(true);
  });

  it("drains instead of destroying when cancelled before pipe event", async () => {
    const readable = new PassThrough();
    // No 'pipe' event yet — simulates client disconnecting before GCS HTTP
    // response arrives and pipeline() is called.

    const webStream = readableToReadableStream(readable);
    const reader = webStream.getReader();
    await reader.cancel();

    // Must NOT be destroyed: calling destroy() before GCS's pipeline() fires
    // causes an uncaught ERR_STREAM_UNABLE_TO_PIPE that crashes the pod.
    expect(readable.destroyed).toBe(false);
    // Must be flowing (resuming to drain) so GCS can complete its setup.
    expect(readable.readableFlowing).toBe(true);
  });

  it("destroys after pipe event fires when cancelled pre-pipe", async () => {
    const readable = new PassThrough();

    const webStream = readableToReadableStream(readable);
    const reader = webStream.getReader();
    await reader.cancel();

    // Simulate GCS pipeline() setting up — 'pipe' fires synchronously during it.
    const src = new PassThrough();
    src.pipe(readable); // triggers 'pipe' on readable → our once-listener destroys

    expect(readable.destroyed).toBe(true);
  });
});
