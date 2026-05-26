import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  GetMCPServerViewsResponseType,
  PatchConversationResponseType,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

type FetchConversationToolsResponse = GetMCPServerViewsResponseType;

const ConversationToolActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  mcp_server_view_id: z.string(),
  agent_configuration_id: z.string().optional(),
});

export type ConversationToolActionRequest = z.infer<
  typeof ConversationToolActionRequestSchema
>;

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/tools.
const app = publicApiApp();

/**
 * @ignoreswagger
 */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", ConversationToolActionRequestSchema),
  async (
    ctx
  ): HandlerResult<
    FetchConversationToolsResponse | PatchConversationResponseType
  > => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversationWithoutContent = conversationRes.value;

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const { action, mcp_server_view_id, agent_configuration_id } =
      ctx.req.valid("json");

    const mcpServerViewRes = await MCPServerViewResource.fetchById(
      auth,
      mcp_server_view_id
    );

    if (!mcpServerViewRes) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_view_not_found",
          message: "MCP server view not found",
        },
      });
    }

    const r = await ConversationResource.upsertMCPServerViews(auth, {
      conversation: conversationWithoutContent,
      mcpServerViews: [mcpServerViewRes],
      enabled: action === "add",
      ...(agent_configuration_id
        ? {
            source: "agent_enabled",
            agentConfigurationId: agent_configuration_id,
          }
        : {
            source: "conversation",
            agentConfigurationId: null,
          }),
    });
    if (r.isErr()) {
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
