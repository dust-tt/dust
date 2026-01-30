import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  ConversationWithoutContentType,
} from "@app/types";
import { isGlobalAgentId } from "@app/types";

/**
 * Get the skill_management MCP server if the agent has configured skills.
 */
export async function getSkillManagementServer(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const owner = auth.getNonNullableWorkspace();

  // For global agents, check if skills are defined in the config.
  // Ideally, we would want to take in input an AgentResource that would have bundled the logic
  // about loading skills and exposes a unified interface.
  if (isGlobalAgentId(agentConfiguration.sId)) {
    if (
      !agentConfiguration.skills?.length ||
      agentConfiguration.skills.length === 0
    ) {
      return null;
    }
  } else {
    // For non-global agents, check if there are skills configured on the agent.
    const skillCount = await AgentSkillModel.count({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: owner.id,
      },
    });

    if (skillCount === 0) {
      return null;
    }
  }

  const skillManagementView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "skill_management"
    );

  if (!skillManagementView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for skill_management. Ensure auto tools are created."
    );
    return null;
  }

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: "skill_management",
    description: "Enable skills for the conversation.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: skillManagementView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: skillManagementView.mcpServerId,
  };
}
