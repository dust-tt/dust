import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { isUsingConversationFiles } from "@app/lib/files";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { FileShareScope, WithAPIErrorResponse } from "@app/types";
import { fileShareScopeSchema } from "@app/types";

const ShareFileRequestBodySchema = z.object({
  shareScope: fileShareScopeSchema,
});

export type ShareFileResponseBody = {
  scope: FileShareScope;
  sharedAt: Date;
  shareUrl: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ShareFileResponseBody>>,
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

  if (file.useCase === "conversation" && file.useCaseMetadata?.conversationId) {
    // For conversation files, check if the user has access to the conversation.
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

  // Only allow sharing Frame files.
  if (!file.isContentCreation) {
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

      // For public sharing, check if file uses conversation files.
      if (shareScope === "public") {
        const fileContent = await getFileContent(auth, file, "original");
        if (!fileContent) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: "File not found.",
            },
          });
        }

        if (isUsingConversationFiles(fileContent)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Frame files that use files from the conversation cannot be shared publicly.",
            },
          });
        }
      }

      await file.setShareScope(auth, shareScope);

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
