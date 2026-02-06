import assert from "assert";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType } from "@app/types";
import { isProjectConversation } from "@app/types";

/**
 * Get the project_conversation MCP server for managing project conversations.
 * Only available with "projects" feature flag and if conversation is in a project.
 */
export async function getProjectConversationServer(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);

  if (
    !featureFlags.includes("projects") ||
    !isProjectConversation(conversation)
  ) {
    return null;
  }

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "project_conversation"
    );

  assert(
    mcpServerView,
    "MCP server view not found for project_conversation. Ensure auto tools are created."
  );

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: "project_conversation",
    description: "Create and manage conversations within projects",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: mcpServerView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: mcpServerView.mcpServerId,
  };
}
