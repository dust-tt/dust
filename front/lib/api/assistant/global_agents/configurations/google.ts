import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import {
  globalAgentGuidelines,
  globalAgentWebSearchGuidelines,
} from "@app/lib/api/assistant/global_agents/guidelines";
import type { MCPServerViewsForGlobalAgentsMap } from "@app/lib/api/assistant/global_agents/tools";
import { _getDefaultWebActionsForGlobalAgent } from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { GEMINI_3_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function _getGeminiProGlobalAgent({
  auth,
  settings,
  mcpServerViews,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettingsModel | null;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
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
    instructionsHtml: null,
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GEMINI_3_PRO_MODEL_CONFIG.providerId,
      modelId: GEMINI_3_PRO_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: GEMINI_3_PRO_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        mcpServerViews,
      }),
    ],
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
