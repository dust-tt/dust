import type { FileUploadedRequestResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isPublicySupportedUseCase } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

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

  if (!isPublicySupportedUseCase(file.useCase)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The file use case is not supported by the API.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const action: Action = validActions.includes(req.query.action as Action)
        ? (req.query.action as Action)
        : "download";

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
