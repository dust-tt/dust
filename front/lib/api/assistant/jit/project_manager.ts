import assert from "assert";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";

/**
 * Get the project_manager MCP server for managing projects.
 * Only available with "projects" feature flag and if conversation is in a project.
 */
export async function getProjectManagerServer(
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
      "project_manager"
    );

  assert(
    mcpServerView,
    "MCP server view not found for project_manager. Ensure auto tools are created."
  );

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: "project_manager",
    description: "Manage project files, URLs, metadata, and conversations",
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
