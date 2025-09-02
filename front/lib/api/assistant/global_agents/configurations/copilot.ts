import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import { _getDefaultWebActionsForGlobalAgent } from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentModelConfigurationType,
} from "@app/types";
import {
  GLOBAL_AGENTS_SID,
  GPT_4_1_MODEL_CONFIG,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

export function _getCopilotGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType | null {
  let status: AgentConfigurationStatus = "active";
  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const name = "copilot";
  const description = "Helps you write agent instructions and improves them.";
  // Writer emoji ✍️ on a yellow background
  const pictureUrl = "/static/emojis/bg-yellow-400/writing_hand/270d-fe0f";

  // Use GPT-4.1 with no reasoning (non-thinking)
  const model: AgentModelConfigurationType = {
    providerId: GPT_4_1_MODEL_CONFIG.providerId,
    modelId: GPT_4_1_MODEL_CONFIG.modelId,
    temperature: 0.3,
    reasoningEffort: "none",
  };

  // Keep agent configuration instructions minimal; Copilot behavior is injected client-side.
  const instructions = "";

  const copilotAgent: AgentConfigurationType = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.COPILOT,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions,
    pictureUrl,
    scope: "global",
    userFavorite: false,
    model,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
    status,
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: GLOBAL_AGENTS_SID.COPILOT,
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun:
      status === "disabled_by_admin" ? 0 : MAX_STEPS_USE_PER_RUN_LIMIT,
  };

  return copilotAgent;
}
