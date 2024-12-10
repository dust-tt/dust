import type { ConversationType, Result } from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import type { File } from "formidable";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import type { Writable } from "stream";

import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

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
      filter: function (part) {
        return part.mimetype === file.contentType;
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

// When we send the attachments at the conversation creation, we are missing the useCaseMetadata
// Therefore, we couldn't upsert them to the conversation datasource.
// We now update the useCaseMetadata and upsert them to the conversation datasource.
export async function maybeUpsertFileAttachment(
  auth: Authenticator,
  {
    contentFragments,
    conversation,
  }: {
    contentFragments: (
      | {
          fileId: string;
        }
      | object
    )[];
    conversation: ConversationType;
  }
) {
  const filesIds = removeNulls(
    contentFragments.map((cf) => {
      if ("fileId" in cf) {
        return cf.fileId;
      }
    })
  );

  if (filesIds.length > 0) {
    const fileResources = await FileResource.fetchByIds(auth, filesIds);
    await Promise.all([
      ...fileResources.map(async (fileResource) => {
        if (
          fileResource.useCase === "conversation" &&
          !fileResource.useCaseMetadata
        ) {
          await fileResource.setUseCaseMetadata({
            conversationId: conversation.sId,
          });

          const r = await processAndUpsertToDataSource(auth, {
            file: fileResource,
          });
          if (r.isErr()) {
            // For now, silently log the error
            logger.warn({
              fileModelId: fileResource.id,
              workspaceId: conversation.owner.sId,
              contentType: fileResource.contentType,
              useCase: fileResource.useCase,
              useCaseMetadata: fileResource.useCaseMetadata,
              message: "Failed to upsert the file.",
              error: r.error,
            });
          }
        }
      }),
    ]);
  }
}
