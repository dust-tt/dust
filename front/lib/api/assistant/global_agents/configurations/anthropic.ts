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
import {
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID (lib/assistant.ts)
 * - Add a case in getGlobalAgent with associated function.
 */

export function _getClaude3HaikuGlobalAgent({
  settings,
  mcpServerViews,
}: {
  settings: GlobalAgentSettingsModel | null;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
}): AgentConfigurationType {
  const status = settings ? settings.status : "disabled_by_admin";

  const sId = GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU;
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
      providerId: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
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

export function _getClaude3OpusGlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.CLAUDE_3_OPUS;
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
      providerId: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
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

export function _getClaude3GlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.CLAUDE_3_SONNET;
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
      providerId: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
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

export function _getClaude4SonnetGlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.CLAUDE_4_SONNET;
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
      providerId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
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

export function _getClaude3_7GlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET;
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
      providerId: CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
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

export function _getClaude4_5SonnetGlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.CLAUDE_4_5_SONNET;
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
      providerId: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        mcpServerViews,
      }),
    ],
    skills: ["frames"],
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

export function _getClaude4_5HaikuGlobalAgent({
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

  const sId = GLOBAL_AGENTS_SID.CLAUDE_4_5_HAIKU;
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
      providerId: CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        mcpServerViews,
      }),
    ],
    skills: ["frames"],
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
