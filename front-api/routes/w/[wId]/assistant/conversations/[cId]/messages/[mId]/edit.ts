import { editUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

const AgentMentionSchema = z.object({
  configurationId: z.string(),
});
const UserMentionSchema = z.object({
  type: z.literal("user"),
  userId: z.string(),
});

const PostEditRequestBodySchema = z.object({
  content: z.string(),
  mentions: z.array(z.union([AgentMentionSchema, UserMentionSchema])),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/edit.
const app = workspaceApp();

app.post("/", validate("json", PostEditRequestBodySchema), async (ctx) => {
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
          "The message you're trying to edit does not exist or is not accessible.",
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
  if (!message || !isUserMessageType(message)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The message you're trying to edit does not exist or is not an user message.",
      },
    });
  }

  const { content, mentions } = ctx.req.valid("json");

  const editedMessageRes = await editUserMessage(auth, {
    conversation,
    message,
    content,
    mentions,
    // For now we never skip tools when interacting with agents from the web client.
    skipToolsValidation: false,
  });
  if (editedMessageRes.isErr()) {
    return apiError(ctx, editedMessageRes.error);
  }

  return ctx.json({ message: editedMessageRes.value.userMessage });
});

export default app;
