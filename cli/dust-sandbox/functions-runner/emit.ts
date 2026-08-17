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

import { mkdirSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";

import type { Output } from "./protocol.ts";

function isRetryableWriteError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EAGAIN" || error.code === "EINTR")
  );
}

// Size policy for run results, cold and warm alike. A result over the inline
// cap is written to a sandbox-local scratch file and replaced by a pointer:
// even drain-safe, a multi-megabyte stdout line is a payload the whole
// delivery chain (exec capture, HTTP callback, event stream) has to carry
// inline, so past the cap the file is the transport and stdout only names it.
// Past the hard cap the result is refused outright with an actionable error.
export const RESULT_INLINE_CAP_BYTES = 256 * 1024;
export const RESULT_HARD_CAP_BYTES = 5 * 1024 * 1024;

// Mirrors SANDBOX_FUNCTION_RESULT_SPILL_DIR in
// front/lib/api/sandbox_functions/result_envelope.ts: front refuses to read a
// pointer outside this directory, so the two must move together.
export const RESULT_SPILL_DIR = "/tmp/dust-fn-results";

export interface ResultSpillPointer {
  ok: true;
  resultFile: string;
  resultBytes: number;
}

export type DeliverableOutput = Output | ResultSpillPointer;

/**
 * Apply the size policy to a run outcome: inline under the cap, spill file +
 * pointer over it, output_too_large over the hard cap. `spillDir` is
 * overridable by tests only.
 */
export function applyResultSpillPolicy(
  out: Output,
  spillDir: string = RESULT_SPILL_DIR
): DeliverableOutput {
  const serialized = JSON.stringify(out);
  const resultBytes = Buffer.byteLength(serialized, "utf8");
  if (resultBytes <= RESULT_INLINE_CAP_BYTES) {
    return out;
  }
  if (resultBytes > RESULT_HARD_CAP_BYTES) {
    return {
      ok: false,
      error: {
        code: "output_too_large",
        message:
          `function result is ${resultBytes} bytes, over the ` +
          `${RESULT_HARD_CAP_BYTES}-byte limit; store large data in a pod ` +
          `file or database and return a pointer to it`,
      },
    };
  }
  try {
    mkdirSync(spillDir, { recursive: true });
    const resultFile = join(spillDir, `${crypto.randomUUID()}.json`);
    writeFileSync(resultFile, serialized);
    return { ok: true, resultFile, resultBytes };
  } catch {
    // A failed spill write (disk pressure, unwritable dir) must not lose the
    // result: fall back to inline emission, which the drain-safe stdout
    // writer (cold) and the backpressure-aware socket path (warm) both
    // deliver whole regardless of size. The caps are transport hygiene, not
    // correctness.
    return out;
  }
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
