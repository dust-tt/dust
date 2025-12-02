import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import {
  batchRenderMessages,
  fetchMessageInConversation,
  softDeleteUserMessage,
} from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { MessageType, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type FetchConversationMessageResponse = {
  message: MessageType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      FetchConversationMessageResponse | { success: boolean }
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { cId, mId } = req.query;

  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (!isString(mId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const conversation = await ConversationResource.fetchById(auth, cId);

      if (!conversation) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found",
          },
        });
      }

      // Verify the message exists.
      const message = await fetchMessageInConversation(
        auth,
        conversation.toJSON(),
        mId
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
        conversation,
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
      return;
    }

    case "DELETE": {
      const conversationRes =
        await ConversationResource.fetchConversationWithoutContent(auth, cId);

      if (conversationRes.isErr()) {
        return apiErrorForConversation(req, res, conversationRes.error);
      }

      const conversation = conversationRes.value;

      const deleteResult = await softDeleteUserMessage(auth, {
        messageId: mId,
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
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
