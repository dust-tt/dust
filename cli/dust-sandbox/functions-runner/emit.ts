// Drain-safe stdout emission for the runner's one-line JSON envelopes.
//
// runner.ts ends with `process.exit(await main())`, and process.exit does NOT
// drain queued asynchronous stdout writes: on a pipe, `process.stdout.write`
// buffers whatever the kernel cannot take immediately, and exiting drops those
// bytes, cutting a large envelope mid-JSON while the process still exits with
// the handler's code. The reader (dsbx, or front through it) then sees a
// JSON-prefixed line that does not parse.
//
// Writing synchronously to fd 1 hands every byte to the kernel before
// returning: the loop covers partial writes, and retries EAGAIN for the case
// where fd 1 is a non-blocking pipe whose buffer is full (the reader will
// drain it). Once this returns, no queued write remains for exit to drop.
//
// The warm server (serve.ts) replies over a unix socket and has its own
// drain-safe path (writeThenEnd/drainPending).

import { writeSync } from "node:fs";

function isRetryableWriteError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EAGAIN" || error.code === "EINTR")
  );
}

/** Serialize `envelope` and write it to stdout as one line, synchronously. */
export function emitEnvelopeLine(envelope: unknown): void {
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    try {
      offset += writeSync(
        process.stdout.fd,
        bytes,
        offset,
        bytes.length - offset
      );
    } catch (error) {
      if (isRetryableWriteError(error)) {
        continue;
      }
      throw error;
    }
  }
}
