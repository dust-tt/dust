import { Transform } from "stream";

import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Calculate the decoded size in bytes from a base64 string length.
 * Accounts for padding characters at the end.
 */
export function getBase64DecodedSize(base64: string): number {
  let padding = 0;
  if (base64.endsWith("==")) {
    padding = 2;
  } else if (base64.endsWith("=")) {
    padding = 1;
  }
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Creates a Transform stream that decodes base64 input in chunks.
 * This avoids holding both the base64 string and decoded buffer in memory simultaneously.
 *
 * The stream accumulates input until it has a multiple of 4 characters (valid base64 chunk),
 * then decodes and pushes the result. Any remainder is kept for the next chunk.
 */
export function createBase64DecodeStream(): Transform {
  let remainder = "";

  return new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      const input = remainder + chunk.toString();
      // Base64 requires 4 characters per group
      const validLength = Math.floor(input.length / 4) * 4;

      if (validLength > 0) {
        const toProcess = input.slice(0, validLength);
        remainder = input.slice(validLength);

        try {
          const decoded = Buffer.from(toProcess, "base64");
          this.push(decoded);
        } catch (err) {
          callback(normalizeError(err));
          return;
        }
      } else {
        remainder = input;
      }

      callback();
    },
    flush(callback) {
      // Process any remaining characters
      if (remainder.length > 0) {
        try {
          const decoded = Buffer.from(remainder, "base64");
          this.push(decoded);
        } catch (err) {
          callback(normalizeError(err));
          return;
        }
      }
      callback();
    },
  });
}

const DEFAULT_MAX_STREAM_SIZE_BYTES = 50 * 1024 * 1024; // 50MB default limit

/**
 * Reads a stream into a buffer with an enforced size limit to prevent OOM.
 * @param readStream - The stream to read from
 * @param maxSizeBytes - Maximum allowed buffer size (default: 50MB). Pass a larger value for known large streams.
 * @returns Ok with the buffer, or Err if the stream exceeds the size limit or fails to read
 */
export async function streamToBuffer(
  readStream: NodeJS.ReadableStream,
  maxSizeBytes: number = DEFAULT_MAX_STREAM_SIZE_BYTES
): Promise<Result<Buffer, string>> {
  try {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of readStream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += buf.length;

      if (totalSize > maxSizeBytes) {
        return new Err(
          `Stream exceeds maximum size of ${maxSizeBytes} bytes (${Math.round(maxSizeBytes / 1024 / 1024)}MB)`
        );
      }

      chunks.push(buf);
    }
    return new Ok(Buffer.concat(chunks));
  } catch (error) {
    return new Err(
      `Failed to read file stream: ${normalizeError(error).message}`
    );
  }
}
