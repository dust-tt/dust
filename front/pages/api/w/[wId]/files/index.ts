import type {
  FileUploadRequestResponseBody,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  ensureContentTypeForUseCase,
  ensureFileSize,
  FileUploadUrlRequestSchema,
  isSupportedFileContentType,
  rateLimiter,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadRequestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace can update chat sessions.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      const bodyValidation = FileUploadUrlRequestSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }

      // Agressively rate limit file uploads.
      const remaining = await rateLimiter({
        key: `workspace:${owner.id}:file_uploads`,
        maxPerTimeframe: 40,
        timeframeSeconds: 60,
        logger,
      });
      if (remaining < 0) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "You have reached the rate limit for this workspace.",
          },
        });
      }

      const { contentType, fileName, fileSize, useCase } = bodyValidation.right;

      if (!isSupportedFileContentType(contentType)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported.`,
          },
        });
      }

      if (!ensureContentTypeForUseCase(contentType, useCase)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported for use-case ${useCase}.`,
          },
        });
      }

      if (!ensureFileSize(contentType, fileSize)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_too_large",
            message: `File "${fileName}" is too large.`,
          },
        });
      }

      const file = await FileResource.makeNew({
        contentType,
        fileName,
        fileSize,
        userId: user.id,
        workspaceId: owner.id,
        useCase,
      });

      res.status(200).json({ file: file.toJSONWithUploadUrl(auth) });
      return;
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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
