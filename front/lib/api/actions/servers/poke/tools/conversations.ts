import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  GET_CONVERSATION_DETAILS_TOOL_NAME,
  GET_MCP_SERVER_DETAILS_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import config from "@app/lib/api/config";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getPokeConversation } from "@app/lib/poke/conversation";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { Err } from "@app/types/shared/result";

// Redact sensitive fields (sharedSecret, customHeaders values) before exposing
// the MCP server view to the poke agent.
function sanitizeMCPServerView(view: MCPServerViewType): MCPServerViewType {
  return {
    ...view,
    server: {
      ...view.server,
      sharedSecret: view.server.sharedSecret != null ? "<redacted>" : null,
      customHeaders: view.server.customHeaders
        ? Object.fromEntries(
            Object.keys(view.server.customHeaders).map((key) => [
              key,
              "<redacted>",
            ])
          )
        : null,
    },
  };
}

type ConversationHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  | typeof GET_CONVERSATION_DETAILS_TOOL_NAME
  | typeof GET_MCP_SERVER_DETAILS_TOOL_NAME
>;

export const conversationHandlers: ConversationHandlers = {
  [GET_CONVERSATION_DETAILS_TOOL_NAME]: async (
    { workspace_id, conversation_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_CONVERSATION_DETAILS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }

    const conversationRes = await getPokeConversation(
      targetAuthResult.value,
      conversation_id,
      true
    );

    if (conversationRes.isErr()) {
      return new Err(
        new MCPError(
          `Conversation "${conversation_id}" not found: ${conversationRes.error.message}`,
          { tracked: false }
        )
      );
    }

    return jsonResponse({
      workspace_id,
      conversation: conversationRes.value,
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}/conversations/${conversation_id}`,
    });
  },

  [GET_MCP_SERVER_DETAILS_TOOL_NAME]: async (
    { workspace_id, server_view_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_MCP_SERVER_DETAILS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }

    if (server_view_id) {
      const mcpServerView = await MCPServerViewResource.fetchById(
        targetAuthResult.value,
        server_view_id
      );
      if (!mcpServerView) {
        return new Err(
          new MCPError(
            `MCP server view "${server_view_id}" not found in workspace "${workspace_id}".`,
            { tracked: false }
          )
        );
      }
      return jsonResponse({
        workspace_id,
        mcpServerView: sanitizeMCPServerView(mcpServerView.toJSON()),
      });
    }

    // List all MCP server views for the workspace.
    const mcpServerViews = await MCPServerViewResource.listByWorkspace(
      targetAuthResult.value
    );

    return jsonResponse({
      workspace_id,
      count: mcpServerViews.length,
      mcpServerViews: mcpServerViews.map((v) =>
        sanitizeMCPServerView(v.toJSON())
      ),
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },
};
