import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { File } from "formidable";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import type { Writable } from "stream";

import type { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";

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
        | "file_type_not_supported";
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
      filter: function (part) {
        if (part.mimetype !== file.contentType) {
          return false;
        }

        return true;
      },
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
          message: "File is too large.",
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
