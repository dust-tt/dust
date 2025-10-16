import type { AgentConfigurationType } from "@app/types";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types";
import { GLOBAL_AGENTS_SID, NOOP_MODEL_CONFIG } from "@app/types";

export function _getNoopAgent(): AgentConfigurationType | null {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.NOOP,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "noop",
    description: NOOP_MODEL_CONFIG.description,
    instructions: "",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
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
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
