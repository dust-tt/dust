import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  ConversationWithoutContentType,
  LightAgentConfigurationType,
} from "@app/types";

/**
 * Get the skill_management MCP server if agent has configured skills.
 * Only available with "skills" feature flag.
 */
export async function getSkillManagementServer(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType,
  conversation: ConversationWithoutContentType
): Promise<ServerSideMCPServerConfigurationType | null> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);

  if (!featureFlags.includes("skills")) {
    return null;
  }

  // Check if agent has any skills configured.
  const skillCount = await AgentSkillModel.count({
    where: {
      agentConfigurationId: agentConfiguration.id,
      workspaceId: owner.id,
    },
  });

  if (skillCount === 0) {
    return null;
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
    additionalConfiguration: {},
    mcpServerViewId: skillManagementView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: skillManagementView.mcpServerId,
  };
}
