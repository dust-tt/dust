/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { moveMountFile } from "@app/lib/api/files/mount_file_ops";
import {
  getConversationFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import { MoveMountFileRequestBodySchema } from "@app/lib/api/files/mount_schemas";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { fromError } from "zod-validation-error";

export type ConversationFileRelResponseBody = Record<string, never>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ConversationFileRelResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { cId, rel } = req.query;
  if (!isString(cId) || !Array.isArray(rel) || rel.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing conversation id or file path.",
      },
    });
  }

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  const scopedPath = parseScopedFilePath(rel.join("/"));
  if (!scopedPath || scopedPath.prefix !== "conversation") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Path must start with the scope prefix `conversation/`.",
      },
    });
  }

  const basePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const normalizedGcsPath = path.posix.normalize(
    `${basePath}${scopedPath.rel}`
  );
  if (!normalizedGcsPath.startsWith(basePath)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }
  const normalizedRelative = scopedPath.rel;

  switch (req.method) {
    case "GET": {
      const bucket = getPrivateUploadBucket();
      const contentTypeResult =
        await bucket.getFileContentType(normalizedGcsPath);
      if (contentTypeResult.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });
      }

      const contentType = contentTypeResult.value ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      const readStream = bucket.file(normalizedGcsPath).createReadStream();
      readStream.on("error", (err) => {
        logger.error(
          { err, gcsPath: normalizedGcsPath },
          "Error streaming conversation file (GCS)"
        );
        readStream.destroy();
        res.end();
      });
      readStream.pipe(res);
      return;
    }

    case "POST": {
      const bodyValidation = MoveMountFileRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const moveResult = await moveMountFile(
        auth,
        { useCase: "conversation", conversationId: cId },
        {
          relativeFilePath: normalizedRelative,
          parentRelativePath: bodyValidation.data.parentRelativePath,
        }
      );
      if (moveResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: moveResult.error.message,
          },
        });
      }

      return res.status(200).json({});
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only GET and POST methods are supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
