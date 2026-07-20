import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Get the triggers_management MCP server for onboarding conversations.
 * Only available if this is the user's onboarding conversation.
 */
export async function getTriggersManagementServer(
  auth: Authenticator,
  agentConfiguration: AgentLoopExecutionData["agentConfiguration"],
  conversation: ConversationWithoutContentType,
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
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

  const triggersManagementView =
    autoInternalViews.get("triggers_management") ?? null;

  if (!triggersManagementView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for triggers_management. Ensure auto tools are created."
    );
    return null;
  }

  const triggersManagementViewJSON = triggersManagementView.toJSON();

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name:
      triggersManagementViewJSON.name ??
      triggersManagementViewJSON.server.name ??
      "triggers_management",
    description:
      triggersManagementViewJSON.description ??
      triggersManagementViewJSON.server.description ??
      "Create schedules and event triggers to automate recurring and event-driven tasks.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: triggersManagementViewJSON.sId,
    dustAppConfiguration: null,
    internalMCPServerId: triggersManagementView.mcpServerId,
  };
}
