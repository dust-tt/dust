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
): AsyncGenerator<{ line: string; lineNumber: number }> {
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  let lineNumber = 1;

  for await (const rawChunk of stream) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    let start = 0;

    while (start < chunk.length) {
      const newline = chunk.indexOf(NEWLINE_BYTE, start);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.subarray(start, end);

      if (pendingBytes + part.length > GREP_LINE_MAX_BYTES) {
        throw new GrepLineTooLongError(lineNumber);
      }
      if (part.length > 0) {
        pending.push(part);
        pendingBytes += part.length;
      }

      if (newline === -1) {
        break;
      }

      let lineBytes = Buffer.concat(pending, pendingBytes);
      if (
        lineBytes.length > 0 &&
        lineBytes[lineBytes.length - 1] === CARRIAGE_RETURN_BYTE
      ) {
        lineBytes = lineBytes.subarray(0, lineBytes.length - 1);
      }
      yield { line: lineBytes.toString("utf8"), lineNumber };

      pending = [];
      pendingBytes = 0;
      lineNumber++;
      start = newline + 1;
    }
  }

  if (pendingBytes > 0) {
    yield {
      line: Buffer.concat(pending, pendingBytes).toString("utf8"),
      lineNumber,
    };
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
    for await (const { line, lineNumber } of readBoundedLines(stream)) {
      if (!regex.test(line)) {
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
    return new Err(normalizeError(err));
  }

  return new Ok({ matches, capped: false });
}
