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
 * Get the schedules_management MCP server for onboarding conversations.
 * Only available if this is the user's onboarding conversation.
 */
export async function getSchedulesManagementServer(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const owner = auth.getNonNullableWorkspace();
  const userResource = auth.user();

  if (!userResource || !owner) {
    return null;
  }

  const onboardingMetadata = await userResource.getMetadata(
    "onboarding:conversation",
    owner.id
  );

  if (onboardingMetadata?.value !== conversation.sId) {
    return null;
  }

  const schedulesManagementView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "schedules_management"
    );

  if (!schedulesManagementView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for schedules_management. Ensure auto tools are created."
    );
    return null;
  }

  const schedulesManagementViewJSON = schedulesManagementView.toJSON();

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name:
      schedulesManagementViewJSON.name ??
      schedulesManagementViewJSON.server.name ??
      "schedules_management",
    description:
      schedulesManagementViewJSON.description ??
      schedulesManagementViewJSON.server.description ??
      "Create schedules to automate recurring tasks.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    additionalConfiguration: {},
    mcpServerViewId: schedulesManagementViewJSON.sId,
    dustAppConfiguration: null,
    internalMCPServerId: schedulesManagementView.mcpServerId,
  };
}
