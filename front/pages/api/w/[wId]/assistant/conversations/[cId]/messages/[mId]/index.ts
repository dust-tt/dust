import type { NextApiRequest, NextApiResponse } from "next";

import {
  softDeleteAgentMessage,
  softDeleteUserMessage,
} from "@app/lib/api/assistant/conversation";
import {
  batchRenderMessages,
  fetchMessageInConversation,
} from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { MessageType, WithAPIErrorResponse } from "@app/types";
import { isAgentMessageType, isString, isUserMessageType } from "@app/types";

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

      const messageRes = await conversation.getMessageById(auth, mId);

      if (messageRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "The message you're trying to delete does not exist.",
          },
        });
      }
      const message = messageRes.value;

      if (!message.userMessage && !message.agentMessage) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "The message you're trying to delete does not exist.",
          },
        });
      }

      const renderRes = await batchRenderMessages(
        auth,
        conversation,
        [message],
        "full"
      );
      if (renderRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Unable to render the message you're trying to delete.",
          },
        });
      }

      const renderedMessage = renderRes.value[0];

      if (isUserMessageType(renderedMessage)) {
        const deleteResult = await softDeleteUserMessage(auth, {
          message: renderedMessage,
          conversation: conversation.toJSON(),
        });
        if (deleteResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: deleteResult.error.type,
              message: deleteResult.error.message,
            },
          });
        }
      } else if (isAgentMessageType(renderedMessage)) {
        const deleteResult = await softDeleteAgentMessage(auth, {
          message: renderedMessage,
          conversation: conversation.toJSON(),
        });
        if (deleteResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: deleteResult.error.type,
              message: deleteResult.error.message,
            },
          });
        }
      } else {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "The message you're trying to delete does not exist.",
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
