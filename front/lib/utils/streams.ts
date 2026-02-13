import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Base64 encoding: every 3 bytes become 4 characters.
// See RFC 4648: https://datatracker.ietf.org/doc/html/rfc4648
const BASE64_CHARS_PER_GROUP = 4;
const BASE64_DECODED_BYTES_PER_GROUP = 3;

export function getBase64DecodedSize(base64: string): number {
  let padding = 0;
  if (base64.endsWith("==")) {
    padding = 2;
  } else if (base64.endsWith("=")) {
    padding = 1;
  }
  return (
    Math.floor(
      (base64.length * BASE64_DECODED_BYTES_PER_GROUP) / BASE64_CHARS_PER_GROUP
    ) - padding
  );
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
