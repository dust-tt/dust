import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import {
  NOTHING_TO_RESUME_ERROR_CODES,
  retryBlockedActions,
} from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/retry:
 *   post:
 *     summary: Retry an agent message
 *     description: Retry generating an agent message response, optionally retrying only blocked actions.
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
 *         description: Successfully retried message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/PrivateAgentMessage'
 *       401:
 *         description: Unauthorized
 */

app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversationResource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const messageRes = await conversationResource.getMessageById(auth, messageId);
  if (messageRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message:
          "The message you're trying to retry does not exist or is not accessible.",
      },
    });
  }

  const messageModel = messageRes.value;
  if (!messageModel.agentMessage) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The message you're trying to retry does not exist or is not an agent message.",
      },
    });
  }

  const conversation = conversationResource.toJSON();

  const renderRes = await batchRenderMessages(
    auth,
    conversationResource,
    [messageModel],
    "full"
  );
  if (renderRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to render message.",
      },
    });
  }

  const message = renderRes.value[0];
  if (!message || !isAgentMessageType(message)) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to render message.",
      },
    });
  }

  // If the query parameter `blocked_only` is true, we retry only the blocked
  // actions.
  if (ctx.req.query("blocked_only") === "true") {
    const retryBlockedActionsRes = await retryBlockedActions(
      auth,
      conversation,
      { messageId }
    );

    if (retryBlockedActionsRes.isErr()) {
      const { error } = retryBlockedActionsRes;

      if (error instanceof DustError) {
        // Nothing left to resume: the blocked actions the user acted on are already gone, and
        // their stale events have just been purged. That is the outcome the caller asked for,
        // so reporting a failure would leave the prompt on screen with no way to clear it.
        if (NOTHING_TO_RESUME_ERROR_CODES.includes(error.code)) {
          return ctx.json({ message });
        }

        if (error.code === "agent_loop_already_running") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: error.message,
            },
          });
        }
      }

      logger.error(
        {
          conversationId: conversation.sId,
          error,
          messageId,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to retry blocked actions"
      );

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to retry blocked actions.",
        },
      });
    }

    return ctx.json({ message });
  }

  const retriedMessageRes = await retryAgentMessage(auth, {
    conversationResource,
    message,
  });
  if (retriedMessageRes.isErr()) {
    return apiError(ctx, retriedMessageRes.error);
  }

  return ctx.json({ message: retriedMessageRes.value });
});

export default app;
