import * as fs from "node:fs";

import { SHORT_BINARY_FALLBACK_BYTES } from "../constants";
import { runCommandSync } from "./exec";

const TEXT_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/x-empty",
  "application/x-javascript",
  "application/xml",
  "inode/x-empty",
]);

function hasNullByte(filePath: string, maxBytes: number): boolean {
  const fileDescriptor = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fileDescriptor, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith("text/") || TEXT_MIME_TYPES.has(mimeType);
}

export function isBinary(filePath: string): boolean {
  let stat: fs.Stats;

  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }

  const fileResult = runCommandSync("file", ["-b", "--mime-type", filePath]);
  if (!fileResult.error && fileResult.status === 0) {
    const mimeType = fileResult.stdout.trim();
    if (isTextMimeType(mimeType)) {
      return false;
    }

    if (stat.size > SHORT_BINARY_FALLBACK_BYTES) {
      return true;
    }
  }

  return hasNullByte(
    filePath,
    Math.min(stat.size, SHORT_BINARY_FALLBACK_BYTES)
  );
}
