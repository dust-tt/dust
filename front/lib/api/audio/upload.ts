import type { Fields, File } from "formidable";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import type { Writable } from "stream";

import type { DustError } from "@app/lib/error";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export const MAX_AUDIO_SIZE_MB = 25 * 1024 * 1024; // 25MB.

const SUPPORTED_AUDIO_FORMATS = ["audio/mp4"]; // M4A only.

export const parseUploadAudioRequest = async (
  req: IncomingMessage,
  writableStream: Writable
): Promise<
  Result<
    { file: File; fields: Fields },
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

      maxFileSize: MAX_AUDIO_SIZE_MB,

      filter: (part) => {
        // Only accept M4A files in the "audio" field.
        if (part.name === "audio") {
          return SUPPORTED_AUDIO_FORMATS.includes(part.mimetype || "");
        }

        // Accept all form fields (title, tags, etc.) but no other file uploads.
        return true;
      },
    });

    const [fields, files] = await form.parse(req);

    const maybeFiles = files.audio;
    if (!maybeFiles || maybeFiles.length === 0) {
      return new Err({
        name: "dust_error",
        code: "file_type_not_supported",
        message: "No file postprocessed.",
      });
    }

    // Form values are arrays by default, convert to strings.
    const processedFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        processedFields[key] = value[0] || "";
      } else {
        processedFields[key] = value || "";
      }
    }

    return new Ok({
      file: maybeFiles[0],
      fields: processedFields,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith("options.maxTotalFileSize")) {
        return new Err({
          name: "dust_error",
          code: "file_too_large",
          message: "Audio file is too large.",
        });
      }

      // Entire message: options.allowEmptyFiles is false, file size should be greater than 0.
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
      message: `Error uploading file: ${normalizeError(error)}`,
    });
  }
};
