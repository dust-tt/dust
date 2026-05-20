import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import {
  deleteMessageFeedback,
  upsertMessageFeedback,
} from "@app/lib/api/assistant/feedback";
import { triggerAgentMessageFeedbackNotification } from "@app/lib/notifications/workflows/agent-message-feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchAgentMessageFeedbackWorkflow } from "@app/temporal/analytics_queue/client";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const MessageFeedbackRequestBodySchema = z.object({
  thumbDirection: z.string(),
  feedbackContent: z.string().nullish(),
  isConversationShared: z.boolean().optional(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/feedbacks.
const app = new Hono();

app.post(
  "/",
  validate("json", MessageFeedbackRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const conversationId = ctx.req.param("cId") ?? "";
    const messageId = ctx.req.param("mId") ?? "";

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
      user: user.toJSON(),
      thumbDirection: body.thumbDirection as AgentMessageFeedbackDirection,
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
        agentMessageId: messageId,
        conversationId: conversation.sId,
      },
    });

    await triggerAgentMessageFeedbackNotification(auth, {
      conversationId: conversation.sId,
      messageId,
      agentConfigurationId: created.value.agentConfigurationId,
      thumbDirection: body.thumbDirection as AgentMessageFeedbackDirection,
      feedbackId: created.value.feedbackId,
    });

    return ctx.json({ success: true });
  }
);

app.delete("/", async (ctx) => {
  const auth = ctx.get("auth");
  const user = auth.getNonNullableUser();
  const conversationId = ctx.req.param("cId") ?? "";
  const messageId = ctx.req.param("mId") ?? "";

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
          "The message you're trying to give feedback to does not exist or is not accessible.",
      },
    });
  }

  const conversation = conversationResource.toJSON();

  const deleted = await deleteMessageFeedback(auth, {
    messageId,
    conversation,
    user: user.toJSON(),
  });

  if (deleted) {
    return ctx.json({ success: true });
  }

  return apiError(ctx, {
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message: "The message you're trying to give feedback to does not exist.",
    },
  });
});

export default app;
