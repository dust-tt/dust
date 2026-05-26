import {
  deleteMessageFeedback,
  upsertMessageFeedback,
} from "@app/lib/api/assistant/feedback";
import { getActiveUserFromAuthOrEmail } from "@app/lib/api/user";
import { triggerAgentMessageFeedbackNotification } from "@app/lib/notifications/workflows/agent-message-feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchAgentMessageFeedbackWorkflow } from "@app/temporal/analytics_queue/client";
import { getUserEmailFromHeaders } from "@app/types/user";
import type { PostMessageFeedbackResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export const MessageFeedbackRequestBodySchema = z.object({
  thumbDirection: z.enum(["up", "down"]),
  feedbackContent: z.string().nullish(),
  isConversationShared: z.boolean().optional(),
});

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/feedbacks.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages/{mId}/feedbacks:
 *   post:
 *     summary: Submit feedback for a specific message in a conversation
 *     description: |
 *       Submit user feedback (thumbs up/down) for a specific message in a conversation.
 *       Requires authentication and update:conversation scope.
 *     tags:
 *       - Feedbacks
 *     parameters:
 *       - name: wId
 *         in: path
 *         description: Workspace ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: cId
 *         in: path
 *         description: Conversation ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: mId
 *         in: path
 *         description: Message ID
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - thumbDirection
 *             properties:
 *               thumbDirection:
 *                 type: string
 *                 enum: [up, down]
 *                 description: Direction of the thumb feedback
 *               feedbackContent:
 *                 type: string
 *                 description: Optional feedback text content
 *               isConversationShared:
 *                 type: boolean
 *                 description: Whether the conversation is shared
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request parameters or body
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation or message not found
 *   delete:
 *     summary: Delete feedback for a specific message
 *     description: |
 *       Delete user feedback for a specific message in a conversation.
 *       Requires authentication and update:conversation scope.
 *     tags:
 *       - Feedbacks
 *     parameters:
 *       - name: wId
 *         in: path
 *         description: Workspace ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: cId
 *         in: path
 *         description: Conversation ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: mId
 *         in: path
 *         description: Message ID
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation, message or feedback not found
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", MessageFeedbackRequestBodySchema),
  async (ctx): HandlerResult<PostMessageFeedbackResponseType> => {
    const auth = ctx.get("auth");
    const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

    const user = await getActiveUserFromAuthOrEmail(
      auth,
      getUserEmailFromHeaders(ctx.req.header())
    );

    if (!user) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message:
            "The user does not have an active session or is not authenticated.",
        },
      });
    }

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

    const messageRes = await conversationResource.getMessageById(
      auth,
      messageId
    );

    if (messageRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message:
            "The message you're trying to give feedback to does not exist or is not accessible.",
        },
      });
    }

    const conversation = conversationResource.toJSON();
    const body = ctx.req.valid("json");

    const created = await upsertMessageFeedback(auth, {
      messageId,
      conversation,
      user,
      thumbDirection: body.thumbDirection,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      content: body.feedbackContent || "",
      isConversationShared: body.isConversationShared,
    });

    if (created.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to upsert feedback",
        },
      });
    }

    await launchAgentMessageFeedbackWorkflow(auth, {
      message: {
        conversationId: conversation.sId,
        agentMessageId: messageId,
      },
    });
    await triggerAgentMessageFeedbackNotification(auth, {
      conversationId: conversation.sId,
      messageId,
      agentConfigurationId: created.value.agentConfigurationId,
      thumbDirection: body.thumbDirection,
      feedbackId: created.value.feedbackId,
    });
    return ctx.json({ success: true });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PostMessageFeedbackResponseType> => {
    const auth = ctx.get("auth");
    const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

    const user = await getActiveUserFromAuthOrEmail(
      auth,
      getUserEmailFromHeaders(ctx.req.header())
    );

    if (!user) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message:
            "The user does not have an active session or is not authenticated.",
        },
      });
    }

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

    const messageRes = await conversationResource.getMessageById(
      auth,
      messageId
    );

    if (messageRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message:
            "The message you're trying to give feedback to does not exist or is not accessible.",
        },
      });
    }

    const conversation = conversationResource.toJSON();

    const deleted = await deleteMessageFeedback(auth, {
      messageId,
      conversation,
      user,
    });

    await launchAgentMessageFeedbackWorkflow(auth, {
      message: {
        conversationId: conversation.sId,
        agentMessageId: messageId,
      },
    });

    if (deleted) {
      return ctx.json({ success: true });
    }
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The message you're trying to give feedback to does not exist.",
      },
    });
  }
);

export default app;
