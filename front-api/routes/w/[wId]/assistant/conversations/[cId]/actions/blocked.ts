import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/:cId/actions/blocked.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";

  const conversation = await ConversationResource.fetchById(auth, cId);

  if (!conversation) {
    return apiError(c, {
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

  return c.json({ blockedActions });
});

export default app;
