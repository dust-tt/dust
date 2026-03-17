/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}:
 *   get:
 *     summary: Get a message
 *     description: Retrieve a specific message by its ID within a conversation.
 *     tags:
 *       - Private Messages
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/PrivateUserMessage'
 *                     - $ref: '#/components/schemas/PrivateAgentMessage'
 *                     - $ref: '#/components/schemas/PrivateContentFragment'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message or conversation not found
 *   delete:
 *     summary: Delete a message
 *     description: Soft-delete a user or agent message from a conversation.
 *     tags:
 *       - Private Messages
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully deleted message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message or conversation not found
 */
import {
  softDeleteAgentMessage,
  softDeleteUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { MessageType } from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

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
        message: "Message not found.",
      },
    });
  }

  const message = messageRes.value;

  const branchId = message.branchSId ?? null;

  switch (req.method) {
    case "GET": {
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
      if (!message.userMessage && !message.agentMessage) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "message_not_found",
            message: "The message you're trying to delete does not exist.",
          },
        });
      }

      const conversationRes = await getConversation(
        auth,
        conversation.sId,
        false,
        branchId
      );

      if (conversationRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Unable to get the conversation.",
          },
        });
      }

      const fullConversation = conversationRes.value;

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
          conversation: fullConversation,
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
          conversation: fullConversation,
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
