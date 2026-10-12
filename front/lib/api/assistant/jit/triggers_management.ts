import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { isUserOnboardingConversation } from "@app/lib/onboarding";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Triggers management for the Dust default agent, and for a user's onboarding
 * conversation on any agent.
 */
export async function getTriggersManagementServer(
  auth: Authenticator,
  agentConfiguration: AgentLoopExecutionData["agentConfiguration"],
  conversation: ConversationWithoutContentType,
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
): Promise<ServerSideMCPServerConfigurationType | null> {
  // Schedules are user-specific, so there is nothing to manage without a user.
  if (!auth.user()) {
    return null;
  }

  const isDustDefaultAgent = agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST;
  if (
    !isDustDefaultAgent &&
    !(await isUserOnboardingConversation(auth, conversation.sId))
  ) {
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

  const serverDisplayMetadata =
    triggersManagementView.getServerDisplayMetadata();

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name:
      triggersManagementView.name ??
      serverDisplayMetadata.name ??
      "triggers_management",
    description:
      triggersManagementView.description ??
      serverDisplayMetadata.description ??
      "Create schedules and event triggers to automate recurring and event-driven tasks.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: triggersManagementView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: triggersManagementView.mcpServerId,
  };
}
