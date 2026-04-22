import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { SKILLS_AS_USER_MESSAGES_FEATURE_FLAG } from "@app/lib/api/assistant/skills_rendering";
import { type Authenticator, hasFeatureFlag } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

/**
 * Get the skill_management MCP server if the agent has enableable skills.
 */
export async function getSkillManagementServer(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  conversation: ConversationWithoutContentType,
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
): Promise<ServerSideMCPServerConfigurationType | null> {
  const { availableSkills, equippedSkills } =
    await SkillResource.listForAgentLoop(auth, {
      agentConfiguration,
      conversation,
    });
  const renderSkillsAsUserMessages = await hasFeatureFlag(
    auth,
    SKILLS_AS_USER_MESSAGES_FEATURE_FLAG
  );
  const managementEligibleSkills = renderSkillsAsUserMessages
    ? availableSkills
    : equippedSkills;

  if (managementEligibleSkills.length === 0) {
    return null;
  }

  const skillManagementView = autoInternalViews.get("skill_management") ?? null;

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
