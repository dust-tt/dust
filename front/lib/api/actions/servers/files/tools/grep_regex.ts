import type { Readable } from "node:stream";
import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { RE2 } from "re2-wasm";

export const GREP_LINE_MAX_BYTES = 1024 * 1024;
export const GREP_PATTERN_MAX_CHARS = 4096;
const GREP_RESPONSE_FOOTER_RESERVED_BYTES = 2 * 1024;
export const GREP_RESPONSE_CONTENT_BUDGET_BYTES =
  FILE_OFFLOAD_TEXT_SIZE_BYTES - GREP_RESPONSE_FOOTER_RESERVED_BYTES;

const NEWLINE_BYTE = 0x0a;
const CARRIAGE_RETURN_BYTE = 0x0d;
const ELLIPSIS = "…";

export function compileGrepPattern(pattern: string): Result<RE2, Error> {
  if (pattern.length > GREP_PATTERN_MAX_CHARS) {
    return new Err(
      new Error(
        `Regular expressions cannot exceed ${GREP_PATTERN_MAX_CHARS} characters.`
      )
    );
  }

  try {
    // RE2 guarantees linear-time matching. The unicode flag is required by re2-wasm.
    return new Ok(new RE2(pattern, "mu"));
  } catch (err) {
    return new Err(
      new Error(
        `The pattern uses unsupported syntax or is invalid: ${normalizeError(err).message}`
      )
    );
  }
}

export class GrepLineTooLongError extends Error {
  constructor(lineNumber: number) {
    super(
      `Cannot search line ${lineNumber}: it exceeds ${GREP_LINE_MAX_BYTES} bytes.`
    );
  }
}

async function* readBoundedLines(
  stream: Readable
): AsyncGenerator<Result<{ line: string; lineNumber: number }, Error>> {
  const pending = Buffer.allocUnsafe(GREP_LINE_MAX_BYTES);
  let pendingBytes = 0;
  let lineNumber = 1;

  for await (const rawChunk of stream) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    let start = 0;

    while (start < chunk.length) {
      const newline = chunk.indexOf(NEWLINE_BYTE, start);
      const end = newline === -1 ? chunk.length : newline;
      const partLength = end - start;

      if (pendingBytes + partLength > GREP_LINE_MAX_BYTES) {
        yield new Err(new GrepLineTooLongError(lineNumber));
        return;
      }
      if (partLength > 0) {
        chunk.copy(pending, pendingBytes, start, end);
        pendingBytes += partLength;
      }

      if (newline === -1) {
        break;
      }

      let lineEnd = pendingBytes;
      if (lineEnd > 0 && pending[lineEnd - 1] === CARRIAGE_RETURN_BYTE) {
        lineEnd--;
      }
      yield new Ok({
        line: pending.toString("utf8", 0, lineEnd),
        lineNumber,
      });

      pendingBytes = 0;
      lineNumber++;
      start = newline + 1;
    }
  }

  if (pendingBytes > 0) {
    yield new Ok({
      line: pending.toString("utf8", 0, pendingBytes),
      lineNumber,
    });
  }
}

function truncateUtf8(bytes: Buffer, maxBytes: number): Buffer {
  let end = Math.min(bytes.length, maxBytes);
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
    end--;
  }
  return bytes.subarray(0, end);
}

export type GrepMatches = {
  matches: string[];
  capped: boolean;
};

export async function collectGrepMatches(
  stream: Readable,
  regex: RE2,
  {
    formatMatch,
    maxMatches,
  }: {
    formatMatch: (line: string, lineNumber: number) => string;
    maxMatches: number;
  }
): Promise<Result<GrepMatches, Error>> {
  const matches: string[] = [];
  let outputBytes = 0;

  try {
    for await (const lineResult of readBoundedLines(stream)) {
      if (lineResult.isErr()) {
        return new Err(lineResult.error);
      }
      const { line, lineNumber } = lineResult.value;

      let isMatch: boolean;
      try {
        isMatch = regex.test(line);
      } catch (err) {
        return new Err(normalizeError(err));
      }
      if (!isMatch) {
        continue;
      }

      const separatorBytes = matches.length > 0 ? 1 : 0;
      const availableBytes =
        GREP_RESPONSE_CONTENT_BUDGET_BYTES - outputBytes - separatorBytes;
      if (availableBytes <= 0) {
        return new Ok({ matches, capped: true });
      }

      const formatted = Buffer.from(formatMatch(line, lineNumber), "utf8");
      if (formatted.length > availableBytes) {
        const ellipsisBytes = Buffer.byteLength(ELLIPSIS, "utf8");
        const head = truncateUtf8(
          formatted,
          Math.max(0, availableBytes - ellipsisBytes)
        );
        if (head.length > 0) {
          matches.push(
            head.toString("utf8") +
              (head.length < formatted.length ? ELLIPSIS : "")
          );
        }
        return new Ok({ matches, capped: true });
      }

      matches.push(formatted.toString("utf8"));
      outputBytes += separatorBytes + formatted.length;

      if (matches.length >= maxMatches) {
        return new Ok({ matches, capped: true });
      }
    }
  } catch (err) {
    // Readable stream failures surface while advancing the async iterator.
    return new Err(normalizeError(err));
  }

  return new Ok({ matches, capped: false });
}
