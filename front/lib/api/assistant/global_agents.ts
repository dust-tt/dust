import fs from "fs";
import path from "path";
import { promisify } from "util";

const readFileAsync = promisify(fs.readFile);

import type {
  AgentActionConfigurationType,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentModelConfigurationType,
  ConnectorProvider,
  DataSourceViewType,
  GlobalAgentStatus,
} from "@dust-tt/types";
import {
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  DEFAULT_MAX_STEPS_USE_PER_RUN,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  isProviderWhitelisted,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  O1_HIGH_REASONING_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MINI_HIGH_REASONING_MODEL_CONFIG,
} from "@dust-tt/types";

import {
  DEFAULT_BROWSE_ACTION_DESCRIPTION,
  DEFAULT_BROWSE_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/constants";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";

// Used when returning an agent with status 'disabled_by_admin'
const dummyModelConfiguration = {
  providerId: GPT_4O_MODEL_CONFIG.providerId,
  modelId: GPT_4O_MODEL_CONFIG.modelId,
  temperature: 0,
};

type PrefetchedDataSourcesType = {
  dataSourceViews: (DataSourceViewType & { isInGlobalSpace: boolean })[];
  workspaceId: string;
};

class HelperAssistantPrompt {
  private static instance: HelperAssistantPrompt;
  private staticPrompt: string | null;

  constructor(staticPrompt: string | null) {
    this.staticPrompt = staticPrompt;
  }

  public static async getInstance(): Promise<HelperAssistantPrompt> {
    if (!HelperAssistantPrompt.instance) {
      let staticPrompt: string | null = null;
      try {
        const filePath = path.join(
          process.cwd(),
          "prompt/global_agent_helper_prompt.md"
        );
        staticPrompt = await readFileAsync(filePath, "utf-8");
      } catch (err) {
        logger.error("Error reading prompt file for @help agent:", err);
      }
      HelperAssistantPrompt.instance = new HelperAssistantPrompt(staticPrompt);
    }
    return HelperAssistantPrompt.instance;
  }

  public getStaticPrompt(): string | null {
    return this.staticPrompt;
  }
}

async function getDataSourcesAndWorkspaceIdForGlobalAgents(
  auth: Authenticator
): Promise<PrefetchedDataSourcesType> {
  const owner = auth.getNonNullableWorkspace();
  const dsvs = await DataSourceViewResource.listAssistantDefaultSelected(auth);

  return {
    dataSourceViews: dsvs.map((dsv) => {
      return {
        ...dsv.toJSON(),
        isInGlobalSpace: dsv.space.isGlobal(),
      };
    }),
    workspaceId: owner.sId,
  };
}

function _getDefaultWebActionsForGlobalAgent({
  agentSid,
}: {
  agentSid: GLOBAL_AGENTS_SID;
}): [AgentActionConfigurationType, AgentActionConfigurationType] {
  return [
    {
      id: -1,
      sId: agentSid + "-search-action",
      type: "websearch_configuration",
      name: DEFAULT_WEBSEARCH_ACTION_NAME,
      description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
    },
    {
      id: -1,
      sId: agentSid + "-browse-action",
      type: "browse_configuration",
      name: DEFAULT_BROWSE_ACTION_NAME,
      description: DEFAULT_BROWSE_ACTION_DESCRIPTION,
    },
  ];
}

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID (lib/assitsant.ts)
 * - Add a case in getGlobalAgent with associated function.
 */
function _getHelperGlobalAgent({
  auth,
  helperPromptInstance,
}: {
  auth: Authenticator;
  helperPromptInstance: HelperAssistantPrompt;
}): AgentConfigurationType {
  let prompt = "";

  const user = auth.user();
  if (user) {
    const role = auth.role();
    prompt = `The user you're interacting with is granted with the role ${role}. Their name is ${user.fullName}. `;
  }

  const staticPrompt = helperPromptInstance.getStaticPrompt();

  if (staticPrompt) {
    prompt = prompt + staticPrompt;
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
      }
    : dummyModelConfiguration;
  const status = modelConfiguration ? "active" : "disabled_by_admin";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.HELPER,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "help",
    description: "Help on how to use Dust",
    instructions: prompt,
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
    status: status,
    userFavorite: false,
    scope: "global",
    model: model,
    actions: [
      {
        id: -1,
        sId: GLOBAL_AGENTS_SID.HELPER + "-datasource-action",
        type: "retrieval_configuration",
        query: "auto",
        relativeTimeFrame: "auto",
        topK: "auto",
        dataSources: [
          {
            dataSourceViewId: config.getDustAppsHelperDatasourceViewId(),
            workspaceId: config.getDustAppsWorkspaceId(),
            filter: { parents: null, tags: null },
          },
        ],
        name: "search_dust_docs",
        description: `The documentation of the Dust platform.`,
      },
      ..._getDefaultWebActionsForGlobalAgent({
        agentSid: GLOBAL_AGENTS_SID.HELPER,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getGPT35TurboGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "gpt3.5-turbo",
    description: GPT_3_5_TURBO_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
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
        agentSid: GLOBAL_AGENTS_SID.GPT35_TURBO,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}
function _getGPT4GlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT4,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "gpt4",
    description: GPT_4O_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GPT_4O_MODEL_CONFIG.providerId,
      modelId: GPT_4O_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentSid: GLOBAL_AGENTS_SID.GPT4,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}
function _getO3MiniGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  let status: AgentConfigurationStatus = "active";

  if (settings) {
    status = settings.status;
  }
  if (!auth.isUpgraded()) {
    status = "disabled_free_workspace";
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.O3_MINI,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "o3-mini",
    description: O3_MINI_HIGH_REASONING_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: O3_MINI_HIGH_REASONING_MODEL_CONFIG.providerId,
      modelId: O3_MINI_HIGH_REASONING_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    groupIds: [],
    requestedGroupIds: [],
  };
}
function _getO1GlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.O1,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "o1",
    description: O1_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: O1_MODEL_CONFIG.providerId,
      modelId: O1_MODEL_CONFIG.modelId,
      temperature: 1, // 1 is forced for O1
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: false,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}
function _getO1MiniGlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.O1_MINI,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "o1-mini",
    description: O1_MINI_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: O1_MINI_MODEL_CONFIG.providerId,
      modelId: O1_MINI_MODEL_CONFIG.modelId,
      temperature: 1, // 1 is forced for O1
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: false,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getO1HighReasoningGlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.O1_HIGH_REASONING,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "o1-high-reasoning",
    description: O1_HIGH_REASONING_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: O1_HIGH_REASONING_MODEL_CONFIG.providerId,
      modelId: O1_HIGH_REASONING_MODEL_CONFIG.modelId,
      temperature: 1, // 1 is forced for O1
      reasoningEffort: O1_HIGH_REASONING_MODEL_CONFIG.reasoningEffort,
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: false,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getClaudeInstantGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "disabled_by_admin";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-instant",
    description: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getClaude2GlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_2,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-2",
    description: CLAUDE_2_DEFAULT_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: CLAUDE_2_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_2_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },

    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getClaude3HaikuGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "disabled_by_admin";

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-3-haiku",
    description: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getClaude3OpusGlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-3-opus",
    description: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getClaude3GlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-3",
    description: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.description,
    instructions:
      "Only use visualization if it is strictly necessary to visualize " +
      "data or if it was explicitly requested by the user. " +
      "Do not use visualization if markdown is sufficient.",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },

    actions: [],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getMistralLargeGlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.MISTRAL_LARGE,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "mistral",
    description: MISTRAL_LARGE_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: MISTRAL_LARGE_MODEL_CONFIG.providerId,
      modelId: MISTRAL_LARGE_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentSid: GLOBAL_AGENTS_SID.MISTRAL_LARGE,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getMistralMediumGlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "mistral-medium",
    description: MISTRAL_MEDIUM_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: MISTRAL_MEDIUM_MODEL_CONFIG.providerId,
      modelId: MISTRAL_MEDIUM_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentSid: GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getMistralSmallGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "disabled_by_admin";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.MISTRAL_SMALL,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "mistral-small",
    description: MISTRAL_SMALL_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: MISTRAL_SMALL_MODEL_CONFIG.providerId,
      modelId: MISTRAL_SMALL_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentSid: GLOBAL_AGENTS_SID.MISTRAL_SMALL,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getGeminiProGlobalAgent({
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
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GEMINI_PRO,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "gemini-pro",
    description: GEMINI_PRO_DEFAULT_MODEL_CONFIG.description,
    instructions: `Never start your messages with "[assistant:"`,
    pictureUrl: "https://dust.tt/static/systemavatar/gemini_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: GEMINI_PRO_DEFAULT_MODEL_CONFIG.providerId,
      modelId: GEMINI_PRO_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentSid: GLOBAL_AGENTS_SID.GEMINI_PRO,
      }),
    ],
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getDeepSeekR1GlobalAgent({
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

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DEEPSEEK_R1,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "DeepSeek R1",
    description:
      "DeepSeek's reasoning model. Served from a US inference provider. Cannot use any tools",
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/deepseek_avatar_full.png",
    status,
    scope: "global",
    userFavorite: false,
    model: {
      providerId: FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG.providerId,
      modelId: FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: 1,
    visualizationEnabled: false,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

// Meta prompt used to incentivize the model to answer with brevity.
const BREVITY_PROMPT =
  "When replying to the user, go straight to the point. Answer with precision and brevity.";

function _getManagedDataSourceAgent(
  auth: Authenticator,
  {
    settings,
    connectorProvider,
    agentId,
    name,
    description,
    instructions,
    pictureUrl,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    connectorProvider: ConnectorProvider;
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    description: string;
    instructions: string | null;
    pictureUrl: string;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
      }
    : dummyModelConfiguration;

  // Check if deactivated by an admin
  if (
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      id: -1,
      sId: agentId,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name: name,
      description,
      instructions: null,
      pictureUrl,
      status: "disabled_by_admin",
      scope: "global",
      userFavorite: false,
      model,
      actions: [],
      maxStepsPerRun: 0,
      visualizationEnabled: false,
      templateId: null,
      // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
      groupIds: [],
      requestedGroupIds: [],
    };
  }

  // Check if there's a data source view for this agent
  const filteredDataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.dataSource.connectorProvider === connectorProvider
  );
  if (filteredDataSourceViews.length === 0) {
    return {
      id: -1,
      sId: agentId,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name: name,
      description,
      instructions: null,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      userFavorite: false,
      model,
      actions: [],
      maxStepsPerRun: 0,
      visualizationEnabled: false,
      templateId: null,
      // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
      groupIds: [],
      requestedGroupIds: [],
    };
  }

  return {
    id: -1,
    sId: agentId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: name,
    description,
    instructions,
    pictureUrl,
    status: "active",
    scope: "global",
    userFavorite: false,
    model,
    actions: [
      {
        id: -1,
        sId: agentId + "-action",
        type: "retrieval_configuration",
        query: "auto",
        relativeTimeFrame: "auto",
        topK: "auto",
        dataSources: filteredDataSourceViews.map((dsView) => ({
          dataSourceId: dsView.dataSource.sId,
          dataSourceViewId: dsView.sId,
          workspaceId: preFetchedDataSources.workspaceId,
          filter: { tags: null, parents: null },
        })),
        name: DEFAULT_RETRIEVAL_ACTION_NAME,
        description: `The user's ${connectorProvider} data source.`,
      },
    ],
    maxStepsPerRun: 1,
    visualizationEnabled: false,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function _getGoogleDriveGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
): AgentConfigurationType | null {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "google_drive",
    agentId: GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
    name: "googledrive",
    description: "An assistant with context on your Google Drives.",
    pictureUrl: "https://dust.tt/static/systemavatar/drive_avatar_full.png",
    instructions:
      "Assist the user based on the retrieved data from their Google Drives." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
  });
}

function _getSlackGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
) {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "slack",
    agentId: GLOBAL_AGENTS_SID.SLACK,
    name: "slack",
    description: "An assistant with context on your Slack Channels.",
    pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
    instructions:
      "Assist the user based on the retrieved data from their Slack channels." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
  });
}

function _getGithubGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
) {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "github",
    agentId: GLOBAL_AGENTS_SID.GITHUB,
    name: "github",
    description:
      "An assistant with context on your Github Issues and Discussions.",
    pictureUrl: "https://dust.tt/static/systemavatar/github_avatar_full.png",
    instructions:
      "Assist the user based on the retrieved data from their Github Issues and Discussions." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
  });
}

function _getNotionGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
) {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "notion",
    agentId: GLOBAL_AGENTS_SID.NOTION,
    name: "notion",
    description: "An assistant with context on your Notion Spaces.",
    pictureUrl: "https://dust.tt/static/systemavatar/notion_avatar_full.png",
    instructions:
      "Assist the user based on the retrieved data from their Notion Spaces." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
  });
}

function _getIntercomGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
) {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "intercom",
    agentId: GLOBAL_AGENTS_SID.INTERCOM,
    name: "intercom",
    description: "An assistant with context on your Intercom Help Center data.",
    pictureUrl: "https://dust.tt/static/systemavatar/intercom_avatar_full.png",
    instructions:
      "Assist the user based on the retrieved data from their Intercom Workspace." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
  });
}

function _getDustGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust";
  const description = "An assistant with context on your company data.";
  const pictureUrl = "https://dust.tt/static/systemavatar/dust_avatar_full.png";

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
      }
    : dummyModelConfiguration;

  if (
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name,
      description,
      instructions: null,
      pictureUrl,
      status: "disabled_by_admin",
      scope: "global",
      userFavorite: false,
      model,
      actions: [
        ..._getDefaultWebActionsForGlobalAgent({
          agentSid: GLOBAL_AGENTS_SID.DUST,
        }),
      ],
      maxStepsPerRun: 0,
      visualizationEnabled: true,
      templateId: null,
      // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
      groupIds: [],
      requestedGroupIds: [],
    };
  }

  const dataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.dataSource.assistantDefaultSelected === true
  );

  if (dataSourceViews.length === 0) {
    return {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name,
      description,
      instructions: null,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      userFavorite: false,
      model,
      actions: [],
      maxStepsPerRun: 0,
      visualizationEnabled: true,
      templateId: null,
      // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
      groupIds: [],
      requestedGroupIds: [],
    };
  }

  const instructions = `The assistant answers with precision and brevity. It produces short and straight to the point answers. The assistant should not provide additional information or content that the user did not ask for. When possible, the assistant should answer using a single sentence.
    # When the user asks a questions to the assistant, the assistant should analyze the situation as follows.
    1. If the user's question requires information that is likely private or internal to the company (and therefore unlikely to be found on the public internet or within the assistant's own knowledge), the assistant should search in the company's internal data sources to answer the question. Searching in all datasources is the default behavior unless the user has specified the location in which case it is better to search only on the specific data source. It's important to not pick a restrictive timeframe unless it's explicitly requested or obviously needed.
    2. If the users's question requires information that is recent and likely to be found on the public internet, the assistant should use the internet to answer the question. That means performing a websearch and potentially browse some webpages.
    3. If it is not obvious whether the information would be included in the internal company data sources or on the public internet, the assistant should both search the internal company data sources and the public internet before answering the user's question.
    4. If the user's query require neither internal company data or recent public knowledge, the assistant is allowed to answer without using any tool.
    The assistant always respects the mardown format and generates spaces to nest content.`;

  // We push one action with all data sources
  const actions: AgentActionConfigurationType[] = [
    {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST + "-datasource-action",
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: "auto",
      dataSources: dataSourceViews.map((dsView) => ({
        dataSourceId: dsView.dataSource.sId,
        dataSourceViewId: dsView.sId,
        workspaceId: preFetchedDataSources.workspaceId,
        filter: { parents: null, tags: null },
      })),
      name: "search_all_data_sources",
      description: `The user's entire workspace data sources`,
    },
  ];

  // Add one action per managed data source to improve search results for queries like
  // "search in <data_source>".
  // Only include data sources from the global space to limit actions for the same
  // data source.
  // Hack: Prefix action names with "hidden_" to prevent them from appearing in the UI,
  // avoiding duplicate display of data sources.
  dataSourceViews.forEach((dsView) => {
    if (
      dsView.dataSource.connectorProvider &&
      dsView.dataSource.connectorProvider !== "webcrawler" &&
      dsView.isInGlobalSpace
    ) {
      actions.push({
        id: -1,
        sId:
          GLOBAL_AGENTS_SID.DUST +
          "-datasource-action-" +
          dsView.dataSource.sId,
        type: "retrieval_configuration",
        query: "auto",
        relativeTimeFrame: "auto",
        topK: "auto",
        dataSources: [
          {
            workspaceId: preFetchedDataSources.workspaceId,
            dataSourceViewId: dsView.sId,
            filter: { parents: null, tags: null },
          },
        ],
        name: "hidden_dust_search_" + dsView.dataSource.name,
        description: `The user's ${dsView.dataSource.connectorProvider} data source.`,
      });
    }
  });

  actions.push({
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST + "-websearch-action",
    type: "websearch_configuration",
    name: DEFAULT_WEBSEARCH_ACTION_NAME,
    description: null,
  });
  actions.push({
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST + "-browse-action",
    type: "browse_configuration",
    name: DEFAULT_BROWSE_ACTION_NAME,
    description: null,
  });

  // Fix the action ids.
  actions.forEach((action, i) => {
    action.id = -i;
  });

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions,
    pictureUrl,
    status: "active",
    scope: "global",
    userFavorite: false,
    model,
    actions,
    maxStepsPerRun: DEFAULT_MAX_STEPS_USE_PER_RUN,
    visualizationEnabled: true,
    templateId: null,
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
    requestedGroupIds: [],
  };
}

function getGlobalAgent(
  auth: Authenticator,
  sId: string | number,
  preFetchedDataSources: PrefetchedDataSourcesType,
  helperPromptInstance: HelperAssistantPrompt,
  globaAgentSettings: GlobalAgentSettings[]
): AgentConfigurationType | null {
  const settings =
    globaAgentSettings.find((settings) => settings.agentId === sId) ?? null;

  let agentConfiguration: AgentConfigurationType | null = null;
  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      agentConfiguration = _getHelperGlobalAgent({
        auth,
        helperPromptInstance,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      agentConfiguration = _getGPT35TurboGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.GPT4:
      agentConfiguration = _getGPT4GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O1:
      agentConfiguration = _getO1GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O1_MINI:
      agentConfiguration = _getO1MiniGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
      agentConfiguration = _getO1HighReasoningGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O3_MINI:
      agentConfiguration = _getO3MiniGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      agentConfiguration = _getClaudeInstantGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      agentConfiguration = _getClaude3OpusGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      agentConfiguration = _getClaude3GlobalAgent({
        auth,
        settings,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      agentConfiguration = _getClaude3HaikuGlobalAgent({
        settings,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      agentConfiguration = _getClaude2GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      agentConfiguration = _getMistralLargeGlobalAgent({
        settings,
        auth,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      agentConfiguration = _getMistralMediumGlobalAgent({
        settings,
        auth,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      agentConfiguration = _getMistralSmallGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      agentConfiguration = _getGeminiProGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      agentConfiguration = _getDeepSeekR1GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = _getSlackGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = _getGoogleDriveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = _getNotionGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = _getGithubGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.INTERCOM:
      agentConfiguration = _getIntercomGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = _getDustGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
      });
      break;
    default:
      return null;
  }

  return agentConfiguration;
}

/**
 * Exported functions
 */

export function isGlobalAgentId(sId: string): boolean {
  return (Object.values(GLOBAL_AGENTS_SID) as string[]).includes(sId);
}

// This is the list of global agents that we want to support in past conversations but we don't want
// to be accessible to users moving forward.
const RETIRED_GLOABL_AGENTS_SID = [
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.SLACK,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.INTERCOM,
];

export async function getGlobalAgents(
  auth: Authenticator,
  agentIds?: string[]
): Promise<AgentConfigurationType[]> {
  if (agentIds !== undefined && agentIds.some((sId) => !isGlobalAgentId(sId))) {
    throw new Error("Invalid agentIds.");
  }

  if (agentIds !== undefined && agentIds.length === 0) {
    return [];
  }

  const owner = auth.getNonNullableWorkspace();

  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  const [preFetchedDataSources, globaAgentSettings, helperPromptInstance] =
    await Promise.all([
      getDataSourcesAndWorkspaceIdForGlobalAgents(auth),
      GlobalAgentSettings.findAll({
        where: { workspaceId: owner.id },
      }),
      HelperAssistantPrompt.getInstance(),
    ]);

  // If agentIds have been passed we fetch those. Otherwise we fetch them all, removing the retired
  // one (which will remove these models from the list of default agents in the product + list of
  // user assistants).
  let agentsIdsToFetch =
    agentIds ??
    Object.values(GLOBAL_AGENTS_SID).filter(
      (sId) => !RETIRED_GLOABL_AGENTS_SID.includes(sId)
    );

  const flags = await getFeatureFlags(owner);

  if (!flags.includes("openai_o1_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O1
    );
  }
  if (!flags.includes("openai_o1_mini_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O1_MINI
    );
  }
  if (!flags.includes("openai_o1_high_reasoning_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O1_HIGH_REASONING
    );
  }
  if (!flags.includes("deepseek_r1_global_agent_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.DEEPSEEK_R1
    );
  }

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = agentsIdsToFetch.map((sId) =>
    getGlobalAgent(
      auth,
      sId,
      preFetchedDataSources,
      helperPromptInstance,
      globaAgentSettings
    )
  );

  const globalAgents: AgentConfigurationType[] = [];

  for (const agentFetcherResult of agentCandidates) {
    if (
      agentFetcherResult &&
      agentFetcherResult.scope === "global" &&
      isProviderWhitelisted(owner, agentFetcherResult.model.providerId)
    ) {
      globalAgents.push(agentFetcherResult);
    }
  }

  // add user's favorite status to the agents if needed
  const user = auth.user();
  if (user) {
    const favoriteStates = await getFavoriteStates(auth, {
      configurationIds: globalAgents.map((agent) => agent.sId),
    });

    for (const agent of globalAgents) {
      agent.userFavorite = !!favoriteStates.get(agent.sId);
    }
  }

  return globalAgents;
}

export async function upsertGlobalAgentSettings(
  auth: Authenticator,
  {
    agentId,
    status,
  }: {
    agentId: string;
    status: GlobalAgentStatus;
  }
): Promise<boolean> {
  const owner = auth.getNonNullableWorkspace();

  if (!isGlobalAgentId(agentId)) {
    throw new Error("Global Agent not found: invalid agentId.");
  }

  const settings = await GlobalAgentSettings.findOne({
    where: { workspaceId: owner.id, agentId },
  });

  if (settings) {
    await settings.update({ status });
  } else {
    await GlobalAgentSettings.create({
      workspaceId: owner.id,
      agentId,
      status,
    });
  }

  return true;
}
