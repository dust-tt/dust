import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES } from "@app/lib/file_storage";
import type {
  FileResource,
  FileVersion,
} from "@app/lib/resources/file_resource";
import { streamToBuffer } from "@app/lib/utils/streams";
import { resolveFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { File } from "formidable";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import * as iconv from "iconv-lite";
import { Writable } from "stream";

// Overall budget for receiving the request body and writing it to GCS. Without
// it, a stalled GCS connection (or a stalled client) leaves the request
// hanging forever with no error ever surfaced to the user.
export const FILE_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes.

export const parseUploadRequest = async (
  auth: Authenticator,
  file: FileResource,
  req: IncomingMessage
): Promise<
  Result<
    File,
    Omit<DustError, "code"> & {
      code:
        | "internal_server_error"
        | "file_too_large"
        | "file_type_not_supported"
        | "file_is_empty";
    }
  >
> => {
  // Created by formidable only after the filter accepts a file part, so it is
  // never allocated for rejected uploads. Captured here so the catch block can
  // destroy it if formidable throws mid-upload after opening the stream.
  let writeStream: Writable | undefined;

  // Below the resumable threshold, buffer the payload in memory and write it
  // to GCS once fully received: a buffered write is replayable, so transient
  // GCS errors ("socket hang up") are retried instead of failing the upload.
  // Streamed writes piped straight from the request cannot be retried (the
  // request stream is not replayable); above the threshold the resumable
  // upload in getWriteStream provides per-chunk retry instead.
  const isBufferedUpload = file.fileSize < GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES;
  const chunks: Buffer[] = [];

  try {
    const form = new IncomingForm({
      // Stream the uploaded document to the cloud storage.
      fileWriteStreamHandler: () => {
        writeStream = isBufferedUpload
          ? new Writable({
              write(chunk: Buffer, _encoding, callback) {
                chunks.push(chunk);
                callback();
              },
            })
          : file.getWriteStream({ auth, version: "original" });
        return writeStream;
      },

      // Support only one file upload.
      maxFiles: 1,

      // Validate the file size.
      maxFileSize: file.fileSize,

      // Ensure the file is of the correct type. The content type was already
      // validated at file creation time. Accept when the browser sends
      // "application/octet-stream" (its default for unrecognized extensions
      // like) or no MIME type at all.
      filter: (part) =>
        !part.mimetype ||
        part.mimetype === "application/octet-stream" ||
        // The mime params are already stripped from the file content type.
        resolveFileContentType(part.mimetype, file.fileName) ===
          file.contentType,
    });

    const uploadPromise = (async () => {
      const [, files] = await form.parse(req);

      if (isBufferedUpload && files.file && files.file.length > 0) {
        await file.uploadOriginalFromBuffer(auth, Buffer.concat(chunks));
      }

      return files;
    })();

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutHandle = setTimeout(
        () => resolve("timeout"),
        FILE_UPLOAD_TIMEOUT_MS
      );
    });

    const raced = await Promise.race([uploadPromise, timeoutPromise]);
    clearTimeout(timeoutHandle);

    if (raced === "timeout") {
      // Tear down both ends: the GCS write stream (stalled upstream
      // connection) and the request (stalled client).
      writeStream?.destroy(new Error("File upload timed out."));
      req.destroy();
      // The abandoned promise rejects after the destroy; swallow it to avoid
      // an unhandled rejection.
      uploadPromise.catch(() => {});

      return new Err({
        name: "dust_error",
        code: "internal_server_error",
        message: "File upload timed out.",
      });
    }

    const maybeFiles = raced.file;

    if (!maybeFiles || maybeFiles.length === 0) {
      return new Err({
        name: "dust_error",
        code: "file_type_not_supported",
        message: "No file postprocessed.",
      });
    }

    return new Ok(maybeFiles[0]);
  } catch (error) {
    writeStream?.destroy();
    if (error instanceof Error) {
      if (error.message.startsWith("options.maxTotalFileSize")) {
        return new Err({
          name: "dust_error",
          code: "file_too_large",
          message:
            "File is too large or the size passed to the File instance in the DB does not match the size of the uploaded file.",
        });
      }
      // entire message: options.allowEmptyFiles is false, file size should be greater than 0
      if (error.message.startsWith("options.allowEmptyFiles")) {
        return new Err({
          name: "dust_error",
          code: "file_is_empty",
          message: "File is empty.",
        });
      }
    }

    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Error uploading file : ${error instanceof Error ? error : new Error(JSON.stringify(error))}`,
    });
  }
};

/**
 * Detects the encoding of a buffer and decodes it to a string.
 * Checks for UTF-16 BOM markers and falls back to UTF-8.
 *
 * Files exported from Windows tools (Notepad, Excel CSV) are frequently UTF-16
 * with a BOM; decoding those as UTF-8 produces interleaved NUL bytes (0x00)
 * that PostgreSQL later rejects ("invalid byte sequence for encoding UTF8:
 * 0x00"). iconv-lite strips the BOM as part of decoding.
 *
 * Mirrors `decodeBuffer` in connectors (`src/connectors/shared/file.ts`).
 */
export function decodeBuffer(data: Uint8Array): string {
  const buffer = Buffer.from(data);

  // Check for UTF-16 LE BOM (FF FE)
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer, "utf16le");
  }

  // Check for UTF-16 BE BOM (FE FF)
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer, "utf16be");
  }

  // Check for UTF-8 BOM (EF BB BF)
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return iconv.decode(buffer, "utf8");
  }

  // Default to UTF-8 without BOM
  return buffer.toString("utf-8");
}

export async function getFileContent(
  auth: Authenticator,
  file: FileResource,
  version?: FileVersion
): Promise<string | null> {
  const readStream = version
    ? file.getReadStream({ auth, version })
    : file.getContentReadStream(auth);
  const bufferResult = await streamToBuffer(readStream);

  if (bufferResult.isErr()) {
    return null;
  }

  return decodeBuffer(bufferResult.value);
}

export function getUpdatedContentAndOccurrences({
  oldString,
  newString,
  currentContent,
}: {
  oldString: string;
  newString: string;
  currentContent: string;
}) {
  // Count occurrences of oldString.
  const regex = new RegExp(
    oldString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );
  const matches = currentContent.match(regex);
  const occurrences = matches ? matches.length : 0;

  const updatedContent = currentContent.replace(regex, newString);

  return {
    occurrences,
    updatedContent,
  };
}
