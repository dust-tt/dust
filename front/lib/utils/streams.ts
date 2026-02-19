import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
