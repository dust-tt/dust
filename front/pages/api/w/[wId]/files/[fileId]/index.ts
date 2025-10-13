import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { FileType, WithAPIErrorResponse } from "@app/types";

export interface FileUploadedRequestResponseBody {
  file: FileType;
}

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own.
  },
};

// Declared here because endpoint-specific.
const VALID_VIEW_VERSIONS: FileVersion[] = ["original", "processed", "public"];
function isValidViewVersion(
  // Because coming from the URL, it can be a string or an array of strings.
  version: string | string[] | undefined
): version is FileVersion {
  return (
    typeof version === "string" &&
    VALID_VIEW_VERSIONS.includes(version as FileVersion)
  );
}

const VALID_ACTIONS = ["view", "download"] as const;
type Action = (typeof VALID_ACTIONS)[number];

function isValidAction(
  action: string | string[] | undefined
): action is Action {
  return typeof action === "string" && VALID_ACTIONS.includes(action as Action);
}

/**
 * Determines the appropriate action for a file based on security rules.
 *
 * Security considerations:
 * - Only safe file types can be viewed
 * - All unsafe file types must be downloaded
 * - Unknown content types are treated as unsafe
 */
export function getSecureFileAction(
  // Because coming from the URL, it can be a string or an array of strings.
  action: string | string[] | undefined,
  file: FileResource
): Action {
  // If action is not a valid action type, default to download.
  if (!isValidAction(action)) {
    return "download";
  }

  // For view action, check if the file type is safe to display.
  if (action === "view") {
    if (!file.isSafeToDisplay()) {
      return "download";
    }
  }

  return action;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadedRequestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;
  if (typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  let space: SpaceResource | null = null;
  if (file.useCaseMetadata?.spaceId) {
    space = await SpaceResource.fetchById(auth, file.useCaseMetadata.spaceId);
  }
  if (file.useCase === "folders_document" && (!space || !space.canRead(auth))) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Check permissions based on useCase and useCaseMetadata
  if (file.useCase === "conversation" && file.useCaseMetadata?.conversationId) {
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
  }

  const isFileAuthor = file.userId === auth.user()?.id;
  const isUploadUseCase =
    file.useCase === "upsert_table" || file.useCase === "folders_document";
  const canWriteInSpace = space ? space.canWrite(auth) : false;

  switch (req.method) {
    case "GET": {
      const action = getSecureFileAction(req.query.action, file);
      if (action === "view") {
        // Get the version of the file.
        const version = isValidViewVersion(req.query.version)
          ? req.query.version
          : "original";

        const readStream = file.getReadStream({
          auth,
          version,
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
      // Check if the user is a builder for the workspace or it's a conversation file
      if (
        isUploadUseCase &&
        !((isFileAuthor && canWriteInSpace) || auth.isBuilder())
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You cannot edit files in that space.",
          },
        });
      } else if (!auth.isBuilder() && file.useCase !== "conversation") {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `builders` for the current workspace can modify files.",
          },
        });
      }

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
      // Check if the user is a builder for the workspace or it's a conversation file or avatar
      if (
        isUploadUseCase &&
        !((isFileAuthor && canWriteInSpace) || auth.isBuilder())
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "You cannot edit files in that space.",
          },
        });
      } else if (
        !space &&
        !auth.isBuilder() &&
        file.useCase !== "conversation" &&
        file.useCase !== "avatar"
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `builders` for the current workspace can modify files.",
          },
        });
      }
      const r = await processAndStoreFile(auth, {
        file,
        content: { type: "incoming_message", value: req },
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

      return res.status(200).json({ file: file.toJSON(auth) });
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

export default withSessionAuthenticationForWorkspace(handler);
