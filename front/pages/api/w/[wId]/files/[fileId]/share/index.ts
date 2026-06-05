// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { ensureAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ShareFileResponseBody } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  fileShareScopeSchema,
  isConversationFileUseCase,
  isInteractiveContentType,
  isUnverifiableFrameFileRefsShareError,
} from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const ShareFileRequestBodySchema = z.object({
  shareScope: fileShareScopeSchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ShareFileResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;
  if (!isString(fileId)) {
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

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    // For conversation files, check if the user has access to the conversation.
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  // Only allow sharing Frame files.
  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared publicly.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const parseResult = ShareFileRequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parseResult.error.message}`,
          },
        });
      }

      const { shareScope } = parseResult.data;

      await file.setShareScope(auth, shareScope);

      const allowlistResult = await ensureAuthorizedFileAccessForShare(
        auth,
        file
      );
      if (allowlistResult.isErr()) {
        const allowlistError = allowlistResult.error;
        return apiError(req, res, {
          status_code:
            allowlistError.code === "invalid_request_error" ? 400 : 500,
          api_error: {
            type:
              allowlistError.code === "invalid_request_error"
                ? "invalid_request_error"
                : "internal_server_error",
            message: allowlistError.message,
            ...(isUnverifiableFrameFileRefsShareError(allowlistError)
              ? { unverifiableRefs: allowlistError.unverifiableRefs }
              : {}),
          },
        });
      }

      const shareInfo = await file.getShareInfo();
      if (!shareInfo) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });
      }

      return res.status(200).json(shareInfo);
    }

    case "GET": {
      const shareInfo = await file.getShareInfo();

      if (!shareInfo) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });
      }

      return res.status(200).json(shareInfo);
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
