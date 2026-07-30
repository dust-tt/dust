import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import type { Readable } from "stream";
import { z } from "zod";

/**
 * Byte-accurate pagination for `cat`-style text file reads.
 *
 * `offset` (1-indexed line number) starts a read at a specific line. Continuation is
 * uniform: every truncated response's footer hands back the `byte_offset` of the next
 * unread byte — the start of the next line when the page ended at a line boundary, or the
 * position inside an oversized line when the page ended mid-line.
 */

// The `files` server is exempt from tool-output offloading (see
// TEXT_OFFLOAD_EXEMPT_MCP_SERVERS), but the response is still budgeted so that content +
// footer stay under FILE_OFFLOAD_TEXT_SIZE_BYTES: the read guarantee should not depend on
// the exemption list.
const TEXT_FILE_PAGE_FOOTER_RESERVED_BYTES = 2 * 1024;
export const TEXT_FILE_PAGE_CONTENT_BUDGET_BYTES =
  FILE_OFFLOAD_TEXT_SIZE_BYTES - TEXT_FILE_PAGE_FOOTER_RESERVED_BYTES;

const NEWLINE_BYTE = 0x0a;
const CARRIAGE_RETURN_BYTE = 0x0d;
// A UTF-8 character is at most 4 bytes: one lead byte plus up to 3 continuation bytes.
const UTF8_MAX_CONTINUATION_BYTES = 3;

export const BYTE_OFFSET_SCHEMA = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    "Byte position from the immediately preceding response's continuation footer (`byte_offset=N`). " +
      "Pass it back exactly to continue reading, whether the previous response ended at a line " +
      "boundary or inside a line. Never compute or invent this value. Do not combine with `offset`."
  );

export const OFFSET_EXCLUSIVITY_ERROR_MESSAGE =
  "Provide either `offset` or `byte_offset`, not both. Use `byte_offset` to continue from a previous response's footer, and `offset` to start reading at a specific line.";

export function byteOffsetBeyondEndMessage(
  path: string,
  byteOffset: number,
  sizeBytes: number
): string {
  return (
    `byte_offset=${byteOffset} is at or beyond the end of \`${path}\` (${sizeBytes} bytes). ` +
    `The file may have changed since this offset was issued; re-read it from the beginning (offset=1).`
  );
}

export function fileChangedMessage(path: string): string {
  return `\`${path}\` appears to have changed since this byte_offset was issued. Re-read the file from the beginning (offset=1).`;
}

function isUtf8ContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Returns the largest cut <= maxBytes such that bytes[0, cut) does not end in the middle of a
 * UTF-8 character.
 */
function utf8BoundaryFloor(bytes: Buffer, maxBytes: number): number {
  if (maxBytes >= bytes.length) {
    return bytes.length;
  }

  let cut = maxBytes;
  for (
    let i = 0;
    i < UTF8_MAX_CONTINUATION_BYTES &&
    cut > 0 &&
    isUtf8ContinuationByte(bytes[cut]);
    i++
  ) {
    cut--;
  }
  if (isUtf8ContinuationByte(bytes[cut])) {
    // Still inside a continuation sequence: the data is not valid UTF-8, cut anywhere.
    return maxBytes;
  }

  return cut;
}

function stripTrailingCr(bytes: Buffer): Buffer {
  return bytes.length > 0 && bytes[bytes.length - 1] === CARRIAGE_RETURN_BYTE
    ? bytes.subarray(0, bytes.length - 1)
    : bytes;
}

function countNewlines(bytes: Buffer): number {
  let count = 0;
  let idx = bytes.indexOf(NEWLINE_BYTE);
  while (idx !== -1) {
    count++;
    idx = bytes.indexOf(NEWLINE_BYTE, idx + 1);
  }
  return count;
}

export type TextFilePageParams = {
  fileSizeBytes: number;
  maxLines: number;
  budgetBytes: number;
  /** First line to emit for line-based pagination (1-indexed). Must be 1 when `byteOffset` is set. */
  startLine: number;
  /**
   * Byte position to resume from (mid-line continuation), or null for line-based reads.
   * Snapped backward to a UTF-8 character boundary when it lands inside a multibyte character.
   */
  byteOffset: number | null;
};

export type TextFilePage = {
  /** Display lines/segments, already prefixed with their line number. */
  parts: string[];
  firstLine: number | null;
  lastLine: number | null;
  /** True when the page resumed inside a line (byteOffset mode, not at a line start). */
  startedMidLine: boolean;
  /** Set when the page ends inside a line; `pos` is the absolute byte offset to resume from. */
  endedMidLine: { line: number; pos: number } | null;
  /**
   * Absolute byte position of the next unread byte — the continuation cursor for the
   * footer, whether the page ended at a line boundary or inside a line. Null at end of file.
   */
  nextByteOffset: number | null;
  /** True when file content remains beyond this page. */
  hasMore: boolean;
  stopReason: "budget" | "max_lines" | null;
};

/**
 * Scans a text file stream and produces one page of numbered display lines.
 *
 * Line-based reads skip whole lines up to `startLine` (classic offset pagination).
 * When `byteOffset` is set, exactly that many bytes are skipped (counting newlines to keep
 * line numbers accurate) and emission resumes from inside the line at that position; an
 * offset landing inside a multibyte character is snapped backward to the character start.
 *
 * When a single line exceeds the whole byte budget of an empty page, the largest
 * UTF-8-boundary-safe prefix is emitted and `endedMidLine` carries the byte position to
 * resume from.
 *
 * Line boundaries are `\n`; a `\r` directly before it is stripped from display (CRLF).
 * Lone-`\r` (classic Mac) line endings are NOT treated as boundaries — such content reads
 * as a single line with embedded carriage returns.
 */
export async function readTextFilePage(
  stream: Readable,
  params: TextFilePageParams
): Promise<TextFilePage> {
  let skipRemaining = params.byteOffset ?? 0;
  let awaitingResume = params.byteOffset !== null;
  // Last bytes seen while skipping, kept to snap a byteOffset that lands inside a multibyte
  // character back to the character's lead byte, and to detect a resume at a line start.
  const skipTail: number[] = [];
  let lineNumber = 1;
  let consumedBytes = 0;
  let startedMidLine = false;
  let isContinuationSegment = false;

  let pending: Buffer[] = [];
  let pendingBytes = 0;
  const parts: string[] = [];
  let budget = params.budgetBytes;
  let emittedLineCount = 0;
  let firstLine: number | null = null;
  let lastLine: number | null = null;
  let endedMidLine: { line: number; pos: number } | null = null;
  let stopReason: "budget" | "max_lines" | null = null;

  // Handles one complete line (bytes without the trailing "\n"). Returns false when the page
  // is complete and scanning must stop.
  const handleCompleteLine = (raw: Buffer, hasNewline: boolean): boolean => {
    if (lineNumber < params.startLine) {
      consumedBytes += raw.length + (hasNewline ? 1 : 0);
      return true;
    }

    const displayRaw = stripTrailingCr(raw);
    const prefix = isContinuationSegment
      ? `${lineNumber} (cont.): `
      : `${lineNumber}: `;
    const prefixBytes = Buffer.byteLength(prefix, "utf8");
    // Parts are joined with "\n", so the separator byte only exists for non-first parts.
    const separatorBytes = parts.length > 0 ? 1 : 0;
    const displayBytes = separatorBytes + prefixBytes + displayRaw.length;

    if (displayBytes <= budget) {
      parts.push(prefix + displayRaw.toString("utf8"));
      budget -= displayBytes;
      consumedBytes += raw.length + (hasNewline ? 1 : 0);
      firstLine = firstLine ?? lineNumber;
      lastLine = lineNumber;
      emittedLineCount++;
      isContinuationSegment = false;
      if (emittedLineCount >= params.maxLines) {
        stopReason = "max_lines";
        return false;
      }
      return true;
    }

    if (parts.length > 0) {
      // The line does not fit in the remaining budget: end the page at the previous line
      // boundary and let the next call (offset-based) pick it up.
      stopReason = "budget";
      return false;
    }

    // Empty page with a line larger than the whole budget: emit the largest UTF-8-safe
    // prefix and hand back the byte position to resume from.
    const cut = utf8BoundaryFloor(displayRaw, budget - prefixBytes);
    const head = displayRaw.subarray(0, cut);
    parts.push(prefix + head.toString("utf8"));
    consumedBytes += cut;
    firstLine = firstLine ?? lineNumber;
    lastLine = lineNumber;
    endedMidLine = { line: lineNumber, pos: consumedBytes };
    stopReason = "budget";
    return false;
  };

  let stopped = false;

  for await (const rawChunk of stream) {
    let chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);

    if (skipRemaining > 0) {
      const skipped = chunk.subarray(0, Math.min(skipRemaining, chunk.length));
      lineNumber += countNewlines(skipped);
      consumedBytes += skipped.length;
      for (const byte of skipped.subarray(
        Math.max(0, skipped.length - UTF8_MAX_CONTINUATION_BYTES)
      )) {
        skipTail.push(byte);
        if (skipTail.length > UTF8_MAX_CONTINUATION_BYTES) {
          skipTail.shift();
        }
      }
      skipRemaining -= skipped.length;
      if (skipRemaining > 0) {
        continue;
      }
      chunk = chunk.subarray(skipped.length);
    }

    if (awaitingResume) {
      if (chunk.length === 0) {
        continue;
      }
      // Snap backward when the requested byte offset lands inside a multibyte character:
      // restore the character's already-skipped bytes so the output starts at its lead byte.
      const restored: number[] = [];
      let firstByte = chunk[0];
      while (
        isUtf8ContinuationByte(firstByte) &&
        skipTail.length > 0 &&
        restored.length < UTF8_MAX_CONTINUATION_BYTES
      ) {
        const previousByte = skipTail.pop();
        if (previousByte === undefined) {
          break;
        }
        restored.unshift(previousByte);
        firstByte = previousByte;
      }
      if (restored.length > 0) {
        if (isUtf8ContinuationByte(firstByte)) {
          // Not valid UTF-8 around the requested position: keep the original cut.
          skipTail.push(...restored);
        } else {
          chunk = Buffer.concat([Buffer.from(restored), chunk]);
          consumedBytes -= restored.length;
        }
      }

      // An empty tail after snapping only occurs for a byte_offset a few bytes into a
      // leading multibyte character; treat the resume as a line start.
      const byteBeforeResume =
        skipTail.length > 0 ? skipTail[skipTail.length - 1] : null;
      startedMidLine =
        consumedBytes > 0 &&
        byteBeforeResume !== null &&
        byteBeforeResume !== NEWLINE_BYTE;
      isContinuationSegment = startedMidLine;
      awaitingResume = false;
    }

    let searchFrom = 0;
    while (searchFrom <= chunk.length) {
      const newlineIndex = chunk.indexOf(NEWLINE_BYTE, searchFrom);
      if (newlineIndex === -1) {
        const rest = chunk.subarray(searchFrom);
        if (rest.length === 0) {
          break;
        }
        if (lineNumber < params.startLine) {
          // The line is being skipped: account for it as it streams instead of buffering it.
          consumedBytes += rest.length;
          break;
        }
        pending.push(rest);
        pendingBytes += rest.length;
        // A single line can be arbitrarily large. Once the buffered prefix alone exceeds
        // the page budget the outcome is already decided (split, or stop at the previous
        // line boundary), so resolve it now instead of buffering up to the newline.
        if (pendingBytes > budget) {
          const raw =
            pending.length === 1 ? pending[0] : Buffer.concat(pending);
          pending = [];
          pendingBytes = 0;
          handleCompleteLine(raw, false);
          stopped = true;
        }
        break;
      }

      pending.push(chunk.subarray(searchFrom, newlineIndex));
      const raw = pending.length === 1 ? pending[0] : Buffer.concat(pending);
      pending = [];
      pendingBytes = 0;
      if (!handleCompleteLine(raw, true)) {
        stopped = true;
        break;
      }
      lineNumber++;
      searchFrom = newlineIndex + 1;
    }

    if (stopped) {
      break;
    }
  }

  if (!stopped && pending.length > 0) {
    const raw = pending.length === 1 ? pending[0] : Buffer.concat(pending);
    pending = [];
    handleCompleteLine(raw, false);
  }

  const hasMore = endedMidLine !== null || consumedBytes < params.fileSizeBytes;

  return {
    parts,
    firstLine,
    lastLine,
    startedMidLine,
    endedMidLine,
    nextByteOffset: hasMore ? consumedBytes : null,
    hasMore,
    stopReason,
  };
}

export type TextFilePageRender =
  | { outcome: "ok"; text: string }
  /** byteOffset mode where the stream ran short of the offset: the file shrank between stat and read. */
  | { outcome: "file_changed" };

function describeShownRange(
  firstLine: number,
  lastLine: number,
  startedMidLine: boolean
): string {
  if (startedMidLine) {
    return lastLine > firstLine
      ? `Showing the remainder of line ${firstLine}, then lines ${firstLine + 1}-${lastLine}.`
      : `Showing the remainder of line ${firstLine}.`;
  }
  return `Showing lines ${firstLine}-${lastLine}.`;
}

/**
 * Renders a scanned page as the model-facing text. Whenever more content remains, the
 * footer returns the `byte_offset` to continue from; `offset` is only an input for direct
 * line-based reads.
 */
export function renderTextFilePage(
  page: TextFilePage,
  {
    path,
    fileSizeBytes,
    startLine,
    byteOffset,
  }: {
    path: string;
    fileSizeBytes: number;
    startLine: number;
    byteOffset: number | null;
  }
): TextFilePageRender {
  const { firstLine, lastLine } = page;
  if (page.parts.length === 0 || firstLine === null || lastLine === null) {
    if (byteOffset !== null) {
      return { outcome: "file_changed" };
    }
    if (startLine > 1) {
      return {
        outcome: "ok",
        text: `No lines found at offset ${startLine} in \`${path}\`.`,
      };
    }
    return { outcome: "ok", text: `\`${path}\` is empty.` };
  }

  let text = page.parts.join("\n");

  const kb = FILE_OFFLOAD_TEXT_SIZE_BYTES / 1024;

  if (page.endedMidLine && page.nextByteOffset !== null) {
    text +=
      `\n\n[Truncated inside line ${page.endedMidLine.line} (${kb}KB output cap). ` +
      `File is ${fileSizeBytes} bytes. ` +
      `Use byte_offset=${page.nextByteOffset} to continue reading line ${page.endedMidLine.line}.]`;
  } else if (page.nextByteOffset !== null) {
    const rangeLabel = describeShownRange(
      firstLine,
      lastLine,
      page.startedMidLine
    );
    if (page.stopReason === "budget") {
      text += `\n\n[Truncated at ${kb}KB. File is ${fileSizeBytes} bytes. ${rangeLabel} Use byte_offset=${page.nextByteOffset} to read more.]`;
    } else {
      text += `\n\n[${rangeLabel} Use byte_offset=${page.nextByteOffset} to read more.]`;
    }
  } else if (page.startedMidLine) {
    text += `\n\n[Reached end of file.]`;
  }

  return { outcome: "ok", text };
}
