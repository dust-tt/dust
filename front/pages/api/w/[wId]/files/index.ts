import type {
  FileUploadRequestResponseBody,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import {
  FileUploadUrlRequestSchema,
  getMaximumFileSizeForContentType,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { Authenticator, getSession } from "@app/lib/auth";
import { encodeFilePayload, makeDustFileId } from "@app/lib/files";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<FileUploadRequestResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

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

      const { contentType, fileName, fileSize } = bodyValidation.right;

      const maxFileSize = getMaximumFileSizeForContentType(contentType);
      if (maxFileSize === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `File "${fileName}" is not supported.`,
          },
        });
      }

      if (fileSize > maxFileSize) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_too_large",
            message: `File "${fileName}" is too large.`,
          },
        });
      }

      const fileId = makeDustFileId();

      const fileToken = encodeFilePayload(owner, {
        fileId,
        fileName,
        fileSize,
      });

      const uploadUrl = `${config.getAppUrl()}/api/w/${owner.sId}/files/${fileId}?token=${fileToken}`;

      res.status(200).json({ fileId, uploadUrl });
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

export default withLogging(handler);
