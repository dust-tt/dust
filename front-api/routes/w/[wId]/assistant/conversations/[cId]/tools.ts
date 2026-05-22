import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { isString } from "@app/types/shared/utils/general";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ConversationToolActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  mcp_server_view_id: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/tools.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const conversationId = ctx.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversationWithoutContent = conversationRes.value;
  const agentConfigurationId = ctx.req.query("agent_configuration_id");

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

  return ctx.json({ tools });
});

app.post(
  "/",
  validate("json", ConversationToolActionRequestSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const conversationId = ctx.req.param("cId") ?? "";

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversationWithoutContent = conversationRes.value;
    const { action, mcp_server_view_id } = ctx.req.valid("json");

    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcp_server_view_id
    );

    if (!mcpServerView) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to add MCP server view to conversation",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
