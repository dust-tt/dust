import type { FileUploadedRequestResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { FILE_FORMATS, isPublicySupportedUseCase } from "@app/types";

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own.
  },
};

const validActions = ["view", "download"] as const;
type Action = (typeof validActions)[number];

/**
 * @ignoreswagger
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadedRequestResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;

  if (!fileId || typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The `fileId` query parameter is required.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);

  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "The file was not found.",
      },
    });
  }

  if (!auth.isSystemKey()) {
    // Limit use-case if not a system key.
    if (!isPublicySupportedUseCase(file.useCase)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The file use case is not supported by the API.",
        },
      });
    }
  }

  // Check if the user has access to the file based on its useCase and useCaseMetadata
  if (file.useCase === "conversation" && file.useCaseMetadata?.conversationId) {
    // For conversation files, check if the user has access to the conversation
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (
      !conversation ||
      !ConversationResource.canAccessConversation(auth, conversation)
    ) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  } else if (
    file.useCase === "folders_document" &&
    file.useCaseMetadata?.spaceId
  ) {
    // For folder documents, check if the user has access to the space
    const space = await SpaceResource.fetchById(
      auth,
      file.useCaseMetadata.spaceId
    );
    if (!space || !space.canRead(auth)) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  switch (req.method) {
    case "GET": {
      const action: Action = validActions.includes(req.query.action as Action)
        ? (req.query.action as Action)
        : "download";

      // For non-safe file types or unknown content types, always force download regardless of
      // action.
      const fileFormat = FILE_FORMATS[file.contentType];
      if (!fileFormat.isSafeToDisplay) {
        const url = await file.getSignedUrlForDownload(auth, "original");
        res.redirect(url);
        return;
      }

      // TODO(2024-07-01 flav) Expose the different versions of the file.
      if (action === "view") {
        const readStream = file.getReadStream({
          auth,
          version: "original",
        });
        readStream.on("error", () => {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: "File not found.",
            },
          });
        });
        res.setHeader("Content-Type", file.contentType);
        readStream.pipe(res);
        return;
      }

      // Redirect to a signed URL.
      const url = await file.getSignedUrlForDownload(auth, "original");

      res.redirect(url);
      return;
    }

    case "DELETE": {
      const deleteRes = await file.delete(auth);
      if (deleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to delete the file.",
          },
        });
      }

      res.status(204).end();
      return;
    }

    case "POST": {
      const r = await processAndStoreFile(auth, {
        file,
        content: {
          type: "incoming_message",
          value: req,
        },
      });

      if (r.isErr()) {
        return apiError(req, res, {
          status_code: r.error.code == "internal_server_error" ? 500 : 400,
          api_error: {
            type: r.error.code,
            message: r.error.message,
          },
        });
      }

      // For files with useCase "conversation" that support upsert, directly add them to the data source.
      if (
        file.useCase === "conversation" &&
        isFileTypeUpsertableForUseCase(file)
      ) {
        const jitDataSource = await getOrCreateConversationDataSourceFromFile(
          auth,
          file
        );
        if (jitDataSource.isErr()) {
          logger.warn({
            fileModelId: file.id,
            workspaceId: auth.workspace()?.sId,
            contentType: file.contentType,
            useCase: file.useCase,
            useCaseMetadata: file.useCaseMetadata,
            message: "Failed to get or create JIT data source.",
            error: jitDataSource.error,
          });
        } else {
          const rUpsert = await processAndUpsertToDataSource(
            auth,
            jitDataSource.value,
            { file }
          );
          if (rUpsert.isErr()) {
            logger.error({
              fileModelId: file.id,
              workspaceId: auth.workspace()?.sId,
              contentType: file.contentType,
              useCase: file.useCase,
              useCaseMetadata: file.useCaseMetadata,
              message: "Failed to upsert the file.",
              error: rUpsert.error,
            });
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to upsert the file.",
              },
            });
          }
        }
      }

      return res.status(200).json({ file: file.toPublicJSON(auth) });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: {
    GET: "read:file",
    POST: "create:file",
    DELETE: "delete:file",
  },
});
