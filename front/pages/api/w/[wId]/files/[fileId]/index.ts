import type { FileType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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

// Declared here because endpoint-specific.
const VALID_ACTIONS = ["view", "download"] as const;
type Action = (typeof VALID_ACTIONS)[number];
function isValidAction(
  // Because coming from the URL, it can be a string or an array of strings.
  action: string | string[] | undefined
): action is Action {
  return typeof action === "string" && VALID_ACTIONS.includes(action as Action);
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

  switch (req.method) {
    case "GET": {
      const action = isValidAction(req.query.action)
        ? req.query.action
        : "download";

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
      const r = await processAndStoreFile(auth, { file, reqOrString: req });

      if (r.isErr()) {
        return apiError(req, res, {
          status_code: r.error.code == "internal_server_error" ? 500 : 400,
          api_error: {
            type: r.error.code,
            message: r.error.message,
          },
        });
      }

      // Only upsert immediately in case of conversation
      if (file.useCase === "conversation") {
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

          // For now, silently log the error
          if (rUpsert.isErr()) {
            {
              logger.warn({
                fileModelId: file.id,
                workspaceId: auth.workspace()?.sId,
                contentType: file.contentType,
                useCase: file.useCase,
                useCaseMetadata: file.useCaseMetadata,
                message: "Failed to upsert the file.",
                error: rUpsert.error,
              });
            }
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
