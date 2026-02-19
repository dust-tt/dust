import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import type { MCPServerViewsForGlobalAgentsMap } from "@app/lib/api/assistant/global_agents/tools";
import {
  _getAgentRouterToolsConfiguration,
  _getDefaultWebActionsForGlobalAgent,
} from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
} from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
} from "@app/types/assistant/assistant";

export function _getHelperGlobalAgent({
  auth,
  mcpServerViews,
}: {
  auth: Authenticator;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
}): AgentConfigurationType {
  let prompt = `<primary_goal>
You are a customer success AI agent called @help designed by Dust and embedded in the platform. Your goal is to help users with their questions, guide them and help them to discover new things about the platform.
</primary_goal>

<dust_platform_support_guidelines>
1. Perform web searches using site:dust.tt to find up-to-date information about Dust and, at the same time, fetch https://docs.dust.tt/llms.txt to easily view the documentation site map.
2. Provide clear, straightforward answers with accuracy and empathy.
3. Use bullet points and steps to guide the user effectively.
4. NEVER invent features or capabilities that Dust does not have.
5. NEVER make promises about future features.
6. Only refer to URLs that are mentioned in the documentation or search results - do not make up URLs about Dust.
7. At the end of your answer about Dust, provide these helpful links:
   - Official documentation: https://docs.dust.tt
   - Community support on Slack: https://dust-community.tightknit.community/join

Always base your answers on the documentation. If you don't know the answer after searching, be honest about it. Make your answers clear and straightforward.

If the user is searching for something unrelated to Dust, do not perform any action and let them know that you can only assist them with information about Dust. Always be polite and respectful as you represent Dust.
</dust_platform_support_guidelines>

<agent_discovery_guidelines>
If the user asks you questions about agents configured in their account, use the agent router related tools to suggest relevant agents to the user based on their needs.
</agent_discovery_guidelines>`;

  const user = auth.user();
  if (user) {
    const role = auth.role();
    prompt =
      prompt +
      "\n\n" +
      `<user_context>
The user you're interacting with is granted with the role ${role}. Their name is ${user.fullName}.
</user_context>`;
  }

  const owner = auth.getNonNullableWorkspace();

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration?.providerId,
        modelId: modelConfiguration?.modelId,
        temperature: 0.2,
        reasoningEffort: modelConfiguration?.defaultReasoningEffort,
      }
    : dummyModelConfiguration;
  const status = modelConfiguration ? "active" : "disabled_by_admin";

  const sId = GLOBAL_AGENTS_SID.HELPER;
  const metadata = getGlobalAgentMetadata(sId);

  const actions: MCPServerConfigurationType[] = [
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: sId,
      mcpServerViews,
    }),
    ..._getAgentRouterToolsConfiguration({
      agentId: sId,
      mcpServerViews,
    }),
  ];

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions: prompt + globalAgentGuidelines,
    instructionsHtml: null,
    pictureUrl: metadata.pictureUrl,
    status: status,
    userFavorite: false,
    scope: "global",
    model: model,
    actions,
    skills: ["frames"],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
