import * as fs from "node:fs/promises";

import { LINE_COUNT_BUFFER_BYTES } from "../constants";

const LF = 0x0a;

interface ReadFileWindowParams {
  filePath: string;
  startLine: number;
  maxLines: number;
  byteBudget: number;
}

interface ReadFileWindowResult {
  lines: string[];
  totalLines: number;
  truncatedByBytes: boolean;
}

export async function readFileWindow({
  filePath,
  startLine,
  maxLines,
  byteBudget,
}: ReadFileWindowParams): Promise<ReadFileWindowResult> {
  const lines: string[] = [];
  const buffer = Buffer.alloc(LINE_COUNT_BUFFER_BYTES);

  let totalLines = 0;
  let currentLine = 1;
  let emittedBytes = 0;
  let truncatedByBytes = false;

  let chunks: Buffer[] = [];
  let chunksByteLength = 0;
  let lineHadAnyByte = false;
  let lineExceededLineCap = false;

  const windowEnd = startLine + maxLines;

  const inWindow = () => currentLine >= startLine && currentLine < windowEnd;

  // Per-line collection cap so a multi-GB single-line file cannot fill memory
  // while we are inside the window: the caller's byte budget bounds total
  // emitted bytes, but a single oversized line could still balloon `chunks`.
  const perLineCap = byteBudget;

  const fileHandle = await fs.open(filePath, "r");
  try {
    while (true) {
      const { bytesRead } = await fileHandle.read(
        buffer,
        0,
        buffer.length,
        null
      );
      if (bytesRead === 0) {
        break;
      }

      let segmentStart = 0;
      for (let i = 0; i < bytesRead; i += 1) {
        if (buffer[i] !== LF) {
          if (!lineHadAnyByte) {
            lineHadAnyByte = true;
          }
          continue;
        }

        totalLines += 1;

        if (inWindow() && emittedBytes < byteBudget) {
          const slice = buffer.subarray(segmentStart, i);
          appendChunk(slice);

          const decoded = Buffer.concat(chunks, chunksByteLength).toString(
            "utf8"
          );
          const lineBytes = Buffer.byteLength(decoded, "utf8");

          if (emittedBytes + lineBytes > byteBudget) {
            truncatedByBytes = true;
          } else {
            lines.push(decoded);
            emittedBytes += lineBytes;
            if (lineExceededLineCap) {
              truncatedByBytes = true;
            }
          }
        }

        chunks = [];
        chunksByteLength = 0;
        lineHadAnyByte = false;
        lineExceededLineCap = false;
        currentLine += 1;
        segmentStart = i + 1;
      }

      if (segmentStart < bytesRead && inWindow() && emittedBytes < byteBudget) {
        appendChunk(buffer.subarray(segmentStart, bytesRead));
      } else if (segmentStart < bytesRead) {
        lineHadAnyByte = true;
      }
    }

    if (lineHadAnyByte) {
      totalLines += 1;
      if (inWindow() && emittedBytes < byteBudget) {
        const decoded = Buffer.concat(chunks, chunksByteLength).toString(
          "utf8"
        );
        const lineBytes = Buffer.byteLength(decoded, "utf8");
        if (emittedBytes + lineBytes > byteBudget) {
          truncatedByBytes = true;
        } else {
          lines.push(decoded);
          emittedBytes += lineBytes;
          if (lineExceededLineCap) {
            truncatedByBytes = true;
          }
        }
      }
    }
  } finally {
    await fileHandle.close();
  }

  return { lines, totalLines, truncatedByBytes };

  function appendChunk(slice: Buffer): void {
    if (chunksByteLength + slice.length <= perLineCap) {
      const copy = Buffer.from(slice);
      chunks.push(copy);
      chunksByteLength += copy.length;
      return;
    }

    const remaining = perLineCap - chunksByteLength;
    if (remaining > 0) {
      const copy = Buffer.from(slice.subarray(0, remaining));
      chunks.push(copy);
      chunksByteLength += copy.length;
    }
    lineExceededLineCap = true;
  }
}
