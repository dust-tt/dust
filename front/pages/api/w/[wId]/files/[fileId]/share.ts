import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { isFileUsingConversationFiles } from "@app/lib/files";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isInteractiveContentType } from "@app/types";

const ShareFileRequestBodySchema = z.object({
  isPublic: z.boolean(),
});

export interface ShareFileResponseBody {
  isPublic: boolean;
  shareUrl: string | null;
}

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

  // Only allow sharing of conversation files with interactive content.
  if (
    file.useCase !== "conversation" ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only interactive content files can be shared publicly.",
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

      const { isPublic } = parseResult.data;

      // For now, we only allow public sharing of interactive files that don't use conversation's
      // files. Those should not be shared publicly.
      if (isPublic) {
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

        if (isFileUsingConversationFiles(fileContent)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Interactive files that use files from the conversation cannot be shared publicly.",
            },
          });
        }
      }

      await file.setIsPublic(isPublic);

      return res.status(200).json({
        isPublic,
        shareUrl: file.getPublicShareUrl(auth),
      });
    }

    case "GET": {
      return res.status(200).json({
        isPublic: file.isPublic,
        shareUrl: file.getPublicShareUrl(auth),
      });
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
