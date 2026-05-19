import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { isString } from "@app/types/shared/utils/general";

import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { validate } from "@front-api/middleware/validator";

const ConversationToolActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  mcp_server_view_id: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/tools.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(c, conversationRes.error);
  }

  const conversationWithoutContent = conversationRes.value;
  const agentConfigurationId = c.req.query("agent_configuration_id");

  const conversationMCPServerViews =
    await ConversationResource.fetchMCPServerViews(
      auth,
      conversationWithoutContent,
      {
        onlyEnabled: true,
        ...(isString(agentConfigurationId) ? { agentConfigurationId } : {}),
      }
    );

  const mcpServerViewIds = conversationMCPServerViews.map(
    (v) => v.mcpServerViewId
  );
  const mcpServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    mcpServerViewIds
  );

  const tools = mcpServerViews.map((v) => v.toJSON());

  return c.json({ tools });
});

app.post(
  "/",
  validate("json", ConversationToolActionRequestSchema),
  async (c) => {
    const auth = c.get("auth");
    const conversationId = c.req.param("cId") ?? "";

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );
    if (conversationRes.isErr()) {
      return apiErrorForConversation(c, conversationRes.error);
    }

    const conversationWithoutContent = conversationRes.value;
    const { action, mcp_server_view_id } = c.req.valid("json");

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcp_server_view_id
    );

    if (!mcpServerView) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "MCP server view not found",
        },
      });
    }

    const upsertResult = await ConversationResource.upsertMCPServerViews(auth, {
      conversation: conversationWithoutContent,
      mcpServerViews: [mcpServerView],
      enabled: action === "add",
      source: "conversation",
      agentConfigurationId: null,
    });
    if (upsertResult.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to add MCP server view to conversation",
        },
      });
    }

    return c.json({ success: true });
  }
);

export default app;
