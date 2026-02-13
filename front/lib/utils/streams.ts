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

export async function streamToBuffer(
  readStream: NodeJS.ReadableStream
): Promise<Result<Buffer, string>> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of readStream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return new Ok(Buffer.concat(chunks));
  } catch (error) {
    return new Err(
      `Failed to read file stream: ${normalizeError(error).message}`
    );
  }
}
