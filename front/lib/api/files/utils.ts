import type { File } from "formidable";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import type { Writable } from "stream";

import { streamToBuffer } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
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

export async function getFileContent(
  auth: Authenticator,
  file: FileResource,
  version: FileVersion = "processed"
): Promise<string | null> {
  const readStream = file.getReadStream({ auth, version });
  const bufferResult = await streamToBuffer(readStream);

  if (bufferResult.isErr()) {
    return null;
  }

  return bufferResult.value.toString("utf-8");
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
