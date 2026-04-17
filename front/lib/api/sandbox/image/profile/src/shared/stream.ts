import * as fs from "node:fs";
import { createInterface } from "node:readline";

import { LINE_COUNT_BUFFER_BYTES } from "../constants";

export function countLines(filePath: string): number {
  let fileDescriptor: number | undefined;
  let count = 0;
  let lastByte: number | undefined;

  try {
    fileDescriptor = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(LINE_COUNT_BUFFER_BYTES);

    while (true) {
      const bytesRead = fs.readSync(
        fileDescriptor,
        buffer,
        0,
        buffer.length,
        null
      );

      if (bytesRead === 0) {
        break;
      }

      for (let index = 0; index < bytesRead; index += 1) {
        if (buffer[index] === 0x0a) {
          count += 1;
        }
      }

      lastByte = buffer[bytesRead - 1];
    }
  } catch {
    return 0;
  } finally {
    if (fileDescriptor !== undefined) {
      fs.closeSync(fileDescriptor);
    }
  }

  if (lastByte !== undefined && lastByte !== 0x0a) {
    count += 1;
  }

  return count;
}

export async function* streamLines(
  filePath: string,
  startLine: number,
  maxCount: number
): AsyncGenerator<string> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let currentLine = 1;
  let emitted = 0;

  try {
    // readline still consumes the skipped bytes; this avoids a full in-memory
    // load, but it is not a true seek.
    for await (const line of reader) {
      if (currentLine < startLine) {
        currentLine += 1;
        continue;
      }

      if (emitted >= maxCount) {
        break;
      }

      yield line;
      emitted += 1;
      currentLine += 1;
    }
  } finally {
    reader.close();
    stream.destroy();
  }
}
