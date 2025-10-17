import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import {
  globalAgentGuidelines,
  globalAgentWebSearchGuidelines,
} from "@app/lib/api/assistant/global_agents/guidelines";
import {
  _getDefaultWebActionsForGlobalAgent,
  _getInteractiveContentToolConfiguration,
} from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentConfigurationType } from "@app/types";
import {
  GEMINI_2_5_PRO_MODEL_CONFIG,
  GLOBAL_AGENTS_SID,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

export function _getGeminiProGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  interactiveContentMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  interactiveContentMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status = settings?.status ?? "active";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.GEMINI_PRO;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions: `${globalAgentGuidelines}\n${globalAgentWebSearchGuidelines}`,
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GEMINI_2_5_PRO_MODEL_CONFIG.providerId,
      modelId: GEMINI_2_5_PRO_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: GEMINI_2_5_PRO_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getInteractiveContentToolConfiguration({
        agentId: sId,
        interactiveContentMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
