import { describe, expect, it } from "vitest";

import { isTeenyRequestUnableToPipeError } from "./global_error_handler";

const STREAM_PIPE_ERROR_MESSAGE = "Cannot pipe to a closed or destroyed stream";

function makeStreamPipeError({ code, stack }: { code: string; stack: string }) {
  const error = Object.assign(new Error(STREAM_PIPE_ERROR_MESSAGE), { code });
  error.stack = stack;
  return error;
}

describe("isTeenyRequestUnableToPipeError", () => {
  it("matches teeny-request stream pipe errors", () => {
    const error = makeStreamPipeError({
      code: "ERR_STREAM_UNABLE_TO_PIPE",
      stack:
        "Error [ERR_STREAM_UNABLE_TO_PIPE]: Cannot pipe to a closed or destroyed stream\n" +
        "    at pipelineImpl (node:internal/streams/pipeline:264:15)\n" +
        "    at PassThrough.<anonymous> (/app/node_modules/teeny-request/build/src/index.js:178:43)",
    });

    expect(isTeenyRequestUnableToPipeError(error)).toBe(true);
  });

  it("rejects matching stream errors outside teeny-request", () => {
    const error = makeStreamPipeError({
      code: "ERR_STREAM_UNABLE_TO_PIPE",
      stack:
        "Error [ERR_STREAM_UNABLE_TO_PIPE]: Cannot pipe to a closed or destroyed stream\n" +
        "    at pipelineImpl (node:internal/streams/pipeline:264:15)\n" +
        "    at /app/front/lib/api/files/processing.ts:78:13",
    });

    expect(isTeenyRequestUnableToPipeError(error)).toBe(false);
  });

  it("rejects non-stream-pipe errors from teeny-request", () => {
    const error = makeStreamPipeError({
      code: "ECONNRESET",
      stack:
        "Error: socket hang up\n" +
        "    at PassThrough.<anonymous> (/app/node_modules/teeny-request/build/src/index.js:178:43)",
    });

    expect(isTeenyRequestUnableToPipeError(error)).toBe(false);
  });
});
