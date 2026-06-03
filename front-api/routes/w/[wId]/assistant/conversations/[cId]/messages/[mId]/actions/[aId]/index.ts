import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
  aId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/actions/:aId.
const app = workspaceApp();

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId, mId, aId } = ctx.req.valid("param");

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const messageRes = await conversation.getMessageById(auth, mId);
  if (messageRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found.",
      },
    });
  }

  const message = messageRes.value;
  if (!message.agentMessage) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Message is not an agent message.",
      },
    });
  }

  const action = await AgentMCPActionResource.fetchById(auth, aId);
  if (!action || action.agentMessageId !== message.agentMessage.id) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "action_not_found",
        message: "Action not found.",
      },
    });
  }

  const [enrichedAction] =
    await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
      actions: [action],
      ignoreContent: false,
    });

  return ctx.json({
    action: enrichedAction,
    messageStatus: message.agentMessage.status,
  });
});

export default app;
