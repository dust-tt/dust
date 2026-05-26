import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import type { RetryMessageResponseType } from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export const PostRetryRequestBodySchema = z.union([
  z.null(),
  z.undefined(),
  z.literal(""),
  z.object({}),
]);

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/retry.
const app = publicApiApp();

app.use("*", streamingTag);

/**
 * @ignoreswagger
 * Not documented yet.
 * TODO(Ext)
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostRetryRequestBodySchema),
  async (ctx): HandlerResult<RetryMessageResponseType> => {
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
            "The message you're trying to retry does not exist or is not accessible.",
        },
      });
    }

    const branchId = messageRes.value.getBranchId() ?? null;

    const conversationRes = await getConversation(
      auth,
      conversationId,
      false,
      branchId
    );

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;

    const message = conversation.content
      .flat()
      .find((m) => m.sId === messageId);
    if (!message || !isAgentMessageType(message)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The message you're trying to retry does not exist or is not an agent message.",
        },
      });
    }

    const retriedMessageRes = await retryAgentMessage(auth, {
      conversation,
      message,
    });
    if (retriedMessageRes.isErr()) {
      return apiError(ctx, retriedMessageRes.error);
    }

    return ctx.json({
      message: addBackwardCompatibleAgentMessageFields(retriedMessageRes.value),
    });
  }
);

export default app;
