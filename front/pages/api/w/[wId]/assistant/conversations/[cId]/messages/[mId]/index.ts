import type { NextApiRequest, NextApiResponse } from "next";

import {
  batchRenderMessages,
  fetchMessageInConversation,
} from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { MessageWithRankType, WithAPIErrorResponse } from "@app/types";

export type FetchConversationMessageResponse = {
  message: MessageWithRankType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FetchConversationMessageResponse>>,
  auth: Authenticator
): Promise<void> {
  if (typeof req.query.cId !== "string") {
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
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }
  const messageId = req.query.mId;

  switch (req.method) {
    case "GET":
      // Verify the message exists.
      const message = await fetchMessageInConversation(
        auth,
        conversationRes.value,
        messageId
      );

      if (!message) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "Message not found.",
          },
        });
      }

      const renderedMessages = await batchRenderMessages(
        auth,
        conversationId,
        [message],
        "full"
      );

      if (renderedMessages.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      }

      res.status(200).json({ message: renderedMessages.value[0] });
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
