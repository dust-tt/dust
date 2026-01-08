import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  ConversationWithoutContentType,
  LightAgentConfigurationType,
} from "@app/types";

/**
 * Get the common_utilities MCP server (random numbers, timers, etc.).
 */
export async function getCommonUtilitiesServer(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const commonUtilitiesView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "common_utilities"
    );

  if (!commonUtilitiesView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for common_utilities. Ensure auto tools are created."
    );
    return null;
  }

  const commonUtilitiesViewJSON = commonUtilitiesView.toJSON();
  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name:
      commonUtilitiesViewJSON.name ??
      commonUtilitiesViewJSON.server.name ??
      "common_utilities",
    description:
      commonUtilitiesViewJSON.description ??
      commonUtilitiesViewJSON.server.description ??
      "Common utilities such as random numbers and timers.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    additionalConfiguration: {},
    mcpServerViewId: commonUtilitiesViewJSON.sId,
    dustAppConfiguration: null,
    internalMCPServerId: commonUtilitiesView.mcpServerId,
  };
}
