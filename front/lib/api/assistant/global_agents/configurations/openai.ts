import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import {
  globalAgentGuidelines,
  globalAgentWebSearchGuidelines,
} from "@app/lib/api/assistant/global_agents/guidelines";
import {
  _getContentCreationToolConfiguration,
  _getDefaultWebActionsForGlobalAgent,
} from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationStatus,
  AgentConfigurationType,
} from "@app/types";
import {
  GLOBAL_AGENTS_SID,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
  GPT_5_MODEL_CONFIG,
  GPT_5_NANO_MODEL_CONFIG,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  O1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MODEL_CONFIG,
} from "@app/types";

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID (lib/assistant.ts)
 * - Add a case in getGlobalAgent with associated function.
 */

export function _getGPT35TurboGlobalAgent({
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "active";

  const sId = GLOBAL_AGENTS_SID.GPT35_TURBO;
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
      providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
      modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getGPT4GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.GPT4;
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
      providerId: GPT_4_1_MODEL_CONFIG.providerId,
      modelId: GPT_4_1_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getGPT5GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.GPT5;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions:
      `${globalAgentGuidelines}\n${globalAgentWebSearchGuidelines}\n` +
      "Keep the search depth low and aim to provide an answer quickly, with a maximum of 3 steps of tool use.",
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GPT_5_MODEL_CONFIG.providerId,
      modelId: GPT_5_MODEL_CONFIG.modelId,
      temperature: 0.7,
      /**
       * WARNING: Because the default in ChatGPT is no reasoning, we do the same
       */
      reasoningEffort: "none",
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

/**
 * GPT5 thinking, is gpt5 with reasoning enabled
 * In chatGPT the default is no reasoning, so we do the same!
 */
export function _getGPT5ThinkingGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.GPT5_THINKING;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions:
      `${globalAgentGuidelines}\n${globalAgentWebSearchGuidelines}\n` +
      "Unless the user explicitly requests deeper research, keep the search depth low and" +
      " aim to provide an answer quickly, with a maximum of 3 steps of tool use.",
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GPT_5_MODEL_CONFIG.providerId,
      modelId: GPT_5_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: GPT_5_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getGPT5MiniGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.GPT5_MINI;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions:
      `${globalAgentGuidelines}\n${globalAgentWebSearchGuidelines}\n` +
      "Unless the user explicitly requests deeper research, keep the search depth low and" +
      " aim to provide an answer quickly, with a maximum of 3 steps of tool use.",
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
      modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: GPT_5_MINI_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
export function _getGPT5NanoGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.GPT5_NANO;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions:
      `${globalAgentGuidelines}\n${globalAgentWebSearchGuidelines}\n` +
      "Unless the user explicitly requests deeper research, keep the search depth low and" +
      " aim to provide an answer quickly, with a maximum of 3 steps of tool use.",
    pictureUrl: metadata.pictureUrl,
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GPT_5_NANO_MODEL_CONFIG.providerId,
      modelId: GPT_5_NANO_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: GPT_5_NANO_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getO3MiniGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.O3_MINI;
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
      providerId: O3_MODEL_CONFIG.providerId,
      modelId: O3_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort: "high" as const,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getO1GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status = settings?.status ?? "active";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.O1;
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
      providerId: O1_MODEL_CONFIG.providerId,
      modelId: O1_MODEL_CONFIG.modelId,
      temperature: 1, // 1 is forced for O1
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getO1MiniGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  let status = settings?.status ?? "active";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.O1_MINI;
  const metadata = getGlobalAgentMetadata(sId);

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
      providerId: O1_MINI_MODEL_CONFIG.providerId,
      modelId: O1_MINI_MODEL_CONFIG.modelId,
      temperature: 1, // 1 is forced for O1
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

export function _getO1HighReasoningGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status = settings?.status ?? "active";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.O1_HIGH_REASONING;
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
      providerId: O1_MODEL_CONFIG.providerId,
      modelId: O1_MODEL_CONFIG.modelId,
      temperature: 1,
      reasoningEffort: "high" as const,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

export function _getO3GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
  contentCreationMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  contentCreationMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let status = settings?.status ?? "active";
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  const sId = GLOBAL_AGENTS_SID.O3;
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
      providerId: O3_MODEL_CONFIG.providerId,
      modelId: O3_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
      ..._getContentCreationToolConfiguration({
        agentId: sId,
        contentCreationMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
