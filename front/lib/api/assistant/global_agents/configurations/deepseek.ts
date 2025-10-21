import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { AgentConfigurationType } from "@app/types";
import {
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  GLOBAL_AGENTS_SID,
} from "@app/types";

export function _getDeepSeekR1GlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  let status = settings?.status ?? "disabled_by_admin";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.DEEPSEEK_R1;
  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.DEEPSEEK_R1);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions: globalAgentGuidelines,
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG.providerId,
      modelId: FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [],
    maxStepsPerRun: 1,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
