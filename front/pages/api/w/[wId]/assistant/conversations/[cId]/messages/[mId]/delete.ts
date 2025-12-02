import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { softDeleteUserMessage } from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ success: boolean }>>,
  auth: Authenticator
): Promise<void> {
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }

  const messageId = req.query.mId;

  switch (req.method) {
    case "DELETE":
      const deleteResult = await softDeleteUserMessage(auth, {
        messageId,
        conversation,
      });

      if (deleteResult.isErr()) {
        const error = deleteResult.error;
        if (error.type === "message_not_found") {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "message_not_found",
              message: "The message you're trying to delete does not exist.",
            },
          });
        }
        if (error.type === "message_deletion_not_authorized") {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "message_deletion_not_authorized",
              message: "You are not authorized to delete this message.",
            },
          });
        }
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "An error occurred while deleting the message.",
          },
        });
      }

      res.status(200).json({ success: true });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
