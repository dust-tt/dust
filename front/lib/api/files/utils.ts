import type { File } from "formidable";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import { Writable } from "stream";
import { pipeline } from "stream/promises";

import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type {
  FileResource,
  FileVersion,
} from "@app/lib/resources/file_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export const parseUploadRequest = async (
  file: FileResource,
  req: IncomingMessage,
  writableStream: Writable
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
  try {
    const form = new IncomingForm({
      // Stream the uploaded document to the cloud storage.
      fileWriteStreamHandler: () => writableStream,

      // Support only one file upload.
      maxFiles: 1,

      // Validate the file size.
      maxFileSize: file.fileSize,

      // Ensure the file is of the correct type.
      filter: (part) => part.mimetype === file.contentType,
    });

    const [, files] = await form.parse(req);

    const maybeFiles = files.file;

    if (!maybeFiles || maybeFiles.length === 0) {
      return new Err({
        name: "dust_error",
        code: "file_type_not_supported",
        message: "No file postprocessed.",
      });
    }

    return new Ok(maybeFiles[0]);
  } catch (error) {
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

class MemoryWritable extends Writable {
  private chunks: string[];

  constructor() {
    super();
    this.chunks = [];
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    this.chunks.push(chunk.toString());
    callback();
  }

  getContent() {
    return this.chunks.join("");
  }
}

export async function getFileContent(
  auth: Authenticator,
  file: FileResource,
  version: FileVersion = "processed"
): Promise<string | null> {
  // Create a stream to hold the content of the file
  const writableStream = new MemoryWritable();

  // Read from the processed file
  await pipeline(file.getReadStream({ auth, version }), writableStream);

  const content = writableStream.getContent();

  if (!content) {
    return null;
  }

  return content;
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
