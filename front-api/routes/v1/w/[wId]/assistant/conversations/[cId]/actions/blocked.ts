import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { BlockedActionsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/actions/blocked.
const app = publicApiApp();

/**
 * @ignoreswagger
 */
app.get("/", async (ctx): HandlerResult<BlockedActionsResponseType> => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";

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

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  return ctx.json({ blockedActions });
});

export default app;
