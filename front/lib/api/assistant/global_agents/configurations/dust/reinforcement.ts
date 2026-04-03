import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import { NOOP_MODEL_CONFIG } from "@app/types/assistant/models/noop";

// This agent is never called directly. It is only used as a placeholder when
// building reinforcement conversations so they can be rendered in poke.
export function _getReinforcementGlobalAgent(): AgentConfigurationType {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.REINFORCEMENT,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "Reinforcement",
    description:
      "Internal agent used as a placeholder for reinforcement conversations.",
    instructions: "",
    instructionsHtml: null,
    pictureUrl: DUST_AVATAR_URL,
    status: "active",
    scope: "global",
    userFavorite: false,
    model: {
      providerId: NOOP_MODEL_CONFIG.providerId,
      modelId: NOOP_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
