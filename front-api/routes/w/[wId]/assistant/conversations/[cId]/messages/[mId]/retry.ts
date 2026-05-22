import { retryAgentMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { retryBlockedActions } from "@app/lib/api/assistant/conversation/retry_blocked_actions";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry.
const app = workspaceApp();

app.post("/", async (ctx) => {
  const auth = ctx.get("auth");
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

  const message = conversation.content.flat().find((m) => m.sId === messageId);
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

      if (
        error instanceof DustError &&
        error.code === "agent_loop_already_running"
      ) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: error.message,
          },
        });
      }

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
    conversation,
    message,
  });
  if (retriedMessageRes.isErr()) {
    return apiError(ctx, retriedMessageRes.error);
  }

  return ctx.json({ message: retriedMessageRes.value });
});

export default app;
