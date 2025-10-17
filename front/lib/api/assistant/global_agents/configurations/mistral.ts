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
  GLOBAL_AGENTS_SID,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@app/types";

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID (lib/assistant.ts)
 * - Add a case in getGlobalAgent with associated function.
 */

export function _getMistralLargeGlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.MISTRAL_LARGE;
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
      providerId: MISTRAL_LARGE_MODEL_CONFIG.providerId,
      modelId: MISTRAL_LARGE_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: MISTRAL_LARGE_MODEL_CONFIG.defaultReasoningEffort,
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
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getMistralMediumGlobalAgent({
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
  let status = settings?.status ?? "disabled_by_admin";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.MISTRAL_MEDIUM;
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
      providerId: MISTRAL_MEDIUM_MODEL_CONFIG.providerId,
      modelId: MISTRAL_MEDIUM_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: MISTRAL_MEDIUM_MODEL_CONFIG.defaultReasoningEffort,
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
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getMistralSmallGlobalAgent({
  settings,
  webSearchBrowseMCPServerView,
  interactiveContentMCPServerView,
}: {
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  interactiveContentMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "disabled_by_admin";

  const sId = GLOBAL_AGENTS_SID.MISTRAL_SMALL;
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
      providerId: MISTRAL_SMALL_MODEL_CONFIG.providerId,
      modelId: MISTRAL_SMALL_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: MISTRAL_SMALL_MODEL_CONFIG.defaultReasoningEffort,
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
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
