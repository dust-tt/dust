import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { isUploadSupported } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { FileTypeWithUploadUrl, WithAPIErrorResponse } from "@app/types";
import { ensureFileSize, isSupportedFileContentType } from "@app/types";

// File upload form validation.

const FileUploadUrlRequestSchema = t.union([
  t.type({
    contentType: t.string,
    fileName: t.string,
    fileSize: t.number,
    useCase: t.literal("conversation"),
    useCaseMetadata: t.union([
      t.type({
        conversationId: t.string,
      }),
      t.undefined,
    ]),
  }),
  t.type({
    contentType: t.string,
    fileName: t.string,
    fileSize: t.number,
    useCase: t.literal("folders_document"),
    useCaseMetadata: t.type({
      spaceId: t.string,
    }),
  }),
  t.type({
    contentType: t.string,
    fileName: t.string,
    fileSize: t.number,
    useCase: t.union([t.literal("avatar"), t.literal("upsert_document")]),
    useCaseMetadata: t.undefined,
  }),
  t.type({
    contentType: t.string,
    fileName: t.string,
    fileSize: t.number,
    useCase: t.literal("upsert_table"),
    useCaseMetadata: t.union([
      t.type({
        spaceId: t.string,
      }),
      t.undefined,
    ]),
  }),
]);

export interface FileUploadRequestResponseBody {
  file: FileTypeWithUploadUrl;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadRequestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
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

      // Aggressively rate limit file uploads.
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

      const { contentType, fileName, fileSize, useCase, useCaseMetadata } =
        bodyValidation.right;

      if (!isSupportedFileContentType(contentType)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported.`,
          },
        });
      }

      if (!isUploadSupported({ auth, contentType, useCase })) {
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
        useCaseMetadata: useCaseMetadata,
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

export default withSessionAuthenticationForWorkspace(handler);
