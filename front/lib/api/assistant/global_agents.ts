import fs from "fs";
import path from "path";
import { promisify } from "util";

import {
  DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
  DEFAULT_AGENT_ROUTER_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { SUGGEST_AGENTS_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agent_metadata";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  ConnectorProvider,
  DataSourceViewType,
  GlobalAgentStatus,
} from "@app/types";
import {
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  FIREWORKS_DEEPSEEK_R1_MODEL_CONFIG,
  GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  isGlobalAgentId,
  isProviderWhitelisted,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MODEL_CONFIG,
} from "@app/types";

const readFileAsync = promisify(fs.readFile);

const globalAgentGuidelines = `
  Respond in a helpful, honest, and engaging way. 
  Unless instructed to be brief, present answers with clear structure and formatting to improve readability: use headings, bullet points, and examples when appropriate.
  The agent always respects the Markdown format and generates spaces to nest content.

  Only use visualization if it is strictly necessary to visualize data or if it was explicitly requested by the user.
  Do not use visualization if Markdown is sufficient.
  `;

const globalAgentWebSearchGuidelines = `
  If the user's question requires information that is recent and likely to be found on the public internet, the agent should use the internet to answer the question. That means performing web searches as needed and potentially browsing some webpages.
  If the user's query requires neither internal company data nor recent public knowledge, the agent can answer without using any tool.
`;

// Used when returning an agent with status 'disabled_by_admin'
const dummyModelConfiguration = {
  providerId: GPT_4_1_MODEL_CONFIG.providerId,
  modelId: GPT_4_1_MODEL_CONFIG.modelId,
  temperature: 0,
  reasoningEffort: GPT_4_1_MODEL_CONFIG.defaultReasoningEffort,
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
  agentId,
  webSearchBrowseMCPServerView,
}: {
  agentId: GLOBAL_AGENTS_SID;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
}): ServerSideMCPServerConfigurationType[] {
  if (!webSearchBrowseMCPServerView) {
    return [];
  }

  return [
    {
      id: -1,
      sId: agentId + "-websearch-browse-action",
      type: "mcp_server_configuration",
      name: DEFAULT_WEBSEARCH_ACTION_NAME satisfies InternalMCPServerNameType,
      // Putting a description here is important as it prevents the global agent being detected as
      // a legacy agent (see isLegacyAgent) and being capped to 1 action.
      description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
      mcpServerViewId: webSearchBrowseMCPServerView.sId,
      internalMCPServerId: webSearchBrowseMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    },
  ];
}

function _getAgentRouterToolsConfiguration(
  agentId: GLOBAL_AGENTS_SID,
  mcpServerView: MCPServerViewResource | null,
  internalMCPServerId: string
): ServerSideMCPServerConfigurationType[] {
  if (!mcpServerView) {
    return [];
  }
  return [
    {
      id: -1,
      sId: agentId + "-agent-router",
      type: "mcp_server_configuration",
      name: DEFAULT_AGENT_ROUTER_ACTION_NAME satisfies InternalMCPServerNameType,
      description: DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
      mcpServerViewId: mcpServerView.sId,
      internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    },
  ];
}

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID (lib/assistant.ts)
 * - Add a case in getGlobalAgent with associated function.
 */
function _getHelperGlobalAgent({
  auth,
  helperPromptInstance,
  agentRouterMCPServerView,
  webSearchBrowseMCPServerView,
  searchMCPServerView,
}: {
  auth: Authenticator;
  helperPromptInstance: HelperAssistantPrompt;
  agentRouterMCPServerView: MCPServerViewResource | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  searchMCPServerView: MCPServerViewResource | null;
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
        reasoningEffort: modelConfiguration?.defaultReasoningEffort,
      }
    : dummyModelConfiguration;
  const status = modelConfiguration ? "active" : "disabled_by_admin";

  const actions: MCPServerConfigurationType[] = [];

  if (searchMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.HELPER + "-search-action",
      type: "mcp_server_configuration",
      name: "search_dust_docs",
      description: "The documentation of the Dust platform.",
      mcpServerViewId: searchMCPServerView.sId,
      internalMCPServerId: searchMCPServerView.internalMCPServerId,
      dataSources: [
        {
          dataSourceViewId: config.getDustAppsHelperDatasourceViewId(),
          workspaceId: config.getDustAppsWorkspaceId(),
          filter: { parents: null, tags: null },
        },
      ],
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    });
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.HELPER,
      webSearchBrowseMCPServerView,
    })
  );

  actions.push(
    ..._getAgentRouterToolsConfiguration(
      GLOBAL_AGENTS_SID.HELPER,
      agentRouterMCPServerView,
      internalMCPServerNameToSId({
        name: "agent_router",
        workspaceId: owner.id,
      })
    )
  );

  const sId = GLOBAL_AGENTS_SID.HELPER;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions: prompt + globalAgentGuidelines,
    pictureUrl: metadata.pictureUrl,
    status: status,
    userFavorite: false,
    scope: "global",
    model: model,
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getGPT35TurboGlobalAgent({
  settings,
  webSearchBrowseMCPServerView,
}: {
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
function _getGPT4GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
function _getO3MiniGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
function _getO1GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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

function _getO1HighReasoningGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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

function _getO3GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getClaudeInstantGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): AgentConfigurationType {
  const status = settings ? settings.status : "disabled_by_admin";
  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.CLAUDE_INSTANT);

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
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
      providerId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
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

  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.CLAUDE_2);

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_2,
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
      providerId: CLAUDE_2_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_2_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },

    actions: [],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getClaude3HaikuGlobalAgent({
  settings,
  webSearchBrowseMCPServerView,
}: {
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getClaude3OpusGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getClaude3GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getClaude4SonnetGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getClaude3_7GlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getMistralLargeGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getMistralMediumGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getMistralSmallGlobalAgent({
  settings,
  webSearchBrowseMCPServerView,
}: {
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

function _getGeminiProGlobalAgent({
  auth,
  settings,
  webSearchBrowseMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
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
      providerId: GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG.providerId,
      modelId: GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG.modelId,
      temperature: 0.7,
      reasoningEffort:
        GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG.defaultReasoningEffort,
    },
    actions: [
      ..._getDefaultWebActionsForGlobalAgent({
        agentId: sId,
        webSearchBrowseMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
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
    tags: [],
    canRead: true,
    canEdit: false,
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
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    connectorProvider: ConnectorProvider;
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    description: string;
    instructions: string | null;
    pictureUrl: string;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
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
        reasoningEffort: modelConfiguration.defaultReasoningEffort,
      }
    : dummyModelConfiguration;

  const agent = {
    id: -1,
    sId: agentId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: name,
    description,
    instructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  // Check if deactivated by an admin
  if (
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      ...agent,
      status: "disabled_by_admin",
      maxStepsPerRun: 0,
      actions: [],
    };
  }

  if (!preFetchedDataSources) {
    return {
      ...agent,
      status: "active",
      actions: [],
      maxStepsPerRun: 1,
    };
  }

  // Check if there's a data source view for this agent
  const filteredDataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.dataSource.connectorProvider === connectorProvider
  );

  if (filteredDataSourceViews.length === 0) {
    return {
      ...agent,
      status: "disabled_missing_datasource",
      actions: [],
      maxStepsPerRun: 0,
    };
  }

  const actions: MCPServerConfigurationType[] = [];
  if (searchMCPServerView) {
    actions.push({
      id: -1,
      sId: agentId + "-search-action",
      type: "mcp_server_configuration",
      name: "search_data_sources",
      description: `The user's ${connectorProvider} data source.`,
      mcpServerViewId: searchMCPServerView.sId,
      internalMCPServerId: searchMCPServerView.internalMCPServerId,
      dataSources: filteredDataSourceViews.map((dsView) => ({
        dataSourceViewId: dsView.sId,
        workspaceId: preFetchedDataSources.workspaceId,
        filter: { tags: null, parents: null },
      })),
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    });
  }

  return {
    ...agent,
    status: "active",
    actions,
    maxStepsPerRun: 1,
  };
}

function _getGoogleDriveGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const agentId = GLOBAL_AGENTS_SID.GOOGLE_DRIVE;
  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.GOOGLE_DRIVE);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "google_drive",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Google Drives." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

function _getSlackGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.SLACK;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "slack",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Slack channels." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

function _getGithubGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.GITHUB;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "github",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Github Issues and Discussions." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

function _getNotionGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.NOTION;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "notion",
    agentId: GLOBAL_AGENTS_SID.NOTION,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Notion Spaces." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

function _getIntercomGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.INTERCOM;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "intercom",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Intercom Workspace." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

function _getDustGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    agentRouterMCPServerView,
    webSearchBrowseMCPServerView,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust";
  const description = "An agent with context on your company data.";
  const pictureUrl = "https://dust.tt/static/systemavatar/dust_avatar_full.png";

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
        reasoningEffort: modelConfiguration.defaultReasoningEffort,
      }
    : dummyModelConfiguration;

  const instructions = `${globalAgentGuidelines}
The agent should not provide additional information or content that the user did not ask for.

# When the user asks a question to the agent, the agent should analyze the situation as follows:

1. If the user's question requires information that is likely private or internal to the company
   (and therefore unlikely to be found on the public internet or within the agent's own knowledge),
   the agent should search in the company's internal data sources to answer the question.
   Searching in all datasources is the default behavior unless the user has specified the location,
   in which case it is better to search only on the specific data source.
   It's important to not pick a restrictive timeframe unless it's explicitly requested or obviously needed.
   If no relevant information is found but the user's question seems to be internal to the company,
   the agent should use the ${DEFAULT_AGENT_ROUTER_ACTION_NAME}${TOOL_NAME_SEPARATOR}${SUGGEST_AGENTS_TOOL_NAME}
   tool to suggest an agent that might be able to handle the request.

2. If the user's question requires information that is recent and likely to be found on the public 
   internet, the agent should use the internet to answer the question.
   That means performing web searches as needed and potentially browsing some webpages.

3. If it is not obvious whether the information would be included in the internal company data sources
   or on the public internet, the agent should both search the internal company data sources
   and the public internet before answering the user's question.

4. If the user's query requires neither internal company data nor recent public knowledge,
   the agent is allowed to answer without using any tool.`;

  const dustAgent = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  if (
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      ...dustAgent,
      status: "disabled_by_admin",
      actions: [
        ..._getDefaultWebActionsForGlobalAgent({
          agentId: GLOBAL_AGENTS_SID.DUST,
          webSearchBrowseMCPServerView,
        }),
      ],
      maxStepsPerRun: 0,
    };
  }

  // This only happens when we fetch the list version of the agent.
  if (!preFetchedDataSources) {
    return {
      ...dustAgent,
      status: "active",
      actions: [],
      maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    };
  }

  const actions: MCPServerConfigurationType[] = [];

  const dataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.dataSource.assistantDefaultSelected === true
  );

  // Only add the action if there are data sources and the search MCPServer is available.
  if (dataSourceViews.length > 0 && searchMCPServerView) {
    // We push one action with all data sources
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST + "-datasource-action",
      type: "mcp_server_configuration",
      name: "search_all_data_sources",
      description: "The user's entire workspace data sources",
      mcpServerViewId: searchMCPServerView.sId,
      internalMCPServerId: searchMCPServerView.internalMCPServerId,
      dataSources: dataSourceViews.map((dsView) => ({
        dataSourceViewId: dsView.sId,
        workspaceId: preFetchedDataSources.workspaceId,
        filter: { parents: null, tags: null },
      })),
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    });

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
          type: "mcp_server_configuration",
          name: "hidden_dust_search_" + dsView.dataSource.name,
          description: `The user's ${dsView.dataSource.connectorProvider} data source.`,
          mcpServerViewId: searchMCPServerView.sId,
          internalMCPServerId: searchMCPServerView.internalMCPServerId,
          dataSources: [
            {
              workspaceId: preFetchedDataSources.workspaceId,
              dataSourceViewId: dsView.sId,
              filter: { parents: null, tags: null },
            },
          ],
          tables: null,
          childAgentId: null,
          reasoningModel: null,
          additionalConfiguration: {},
          timeFrame: null,
          dustAppConfiguration: null,
          jsonSchema: null,
        });
      }
    });
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.DUST,
      webSearchBrowseMCPServerView,
    }),
    ..._getAgentRouterToolsConfiguration(
      GLOBAL_AGENTS_SID.DUST,
      agentRouterMCPServerView,
      internalMCPServerNameToSId({
        name: "agent_router",
        workspaceId: owner.id,
      })
    )
  );

  // Fix the action ids.
  actions.forEach((action, i) => {
    action.id = -i;
  });

  return {
    ...dustAgent,
    status: "active",
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}

function getGlobalAgent({
  auth,
  sId,
  preFetchedDataSources,
  helperPromptInstance,
  globalAgentSettings,
  agentRouterMCPServerView,
  webSearchBrowseMCPServerView,
  searchMCPServerView,
}: {
  auth: Authenticator;
  sId: string | number;
  preFetchedDataSources: PrefetchedDataSourcesType | null;
  helperPromptInstance: HelperAssistantPrompt;
  globalAgentSettings: GlobalAgentSettings[];
  agentRouterMCPServerView: MCPServerViewResource | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  searchMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType | null {
  const settings =
    globalAgentSettings.find((settings) => settings.agentId === sId) ?? null;

  let agentConfiguration: AgentConfigurationType | null = null;
  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      agentConfiguration = _getHelperGlobalAgent({
        auth,
        helperPromptInstance,
        agentRouterMCPServerView,
        webSearchBrowseMCPServerView,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      agentConfiguration = _getGPT35TurboGlobalAgent({
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GPT4:
      agentConfiguration = _getGPT4GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O1:
      agentConfiguration = _getO1GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O1_MINI:
      agentConfiguration = _getO1MiniGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
      agentConfiguration = _getO1HighReasoningGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O3_MINI:
      agentConfiguration = _getO3MiniGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.O3:
      agentConfiguration = _getO3GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      agentConfiguration = _getClaudeInstantGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
      agentConfiguration = _getClaude4SonnetGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      agentConfiguration = _getClaude3OpusGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      agentConfiguration = _getClaude3GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      agentConfiguration = _getClaude3HaikuGlobalAgent({
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
      agentConfiguration = _getClaude3_7GlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      agentConfiguration = _getClaude2GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      agentConfiguration = _getMistralLargeGlobalAgent({
        settings,
        auth,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      agentConfiguration = _getMistralMediumGlobalAgent({
        settings,
        auth,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      agentConfiguration = _getMistralSmallGlobalAgent({
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      agentConfiguration = _getGeminiProGlobalAgent({
        auth,
        settings,
        webSearchBrowseMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      agentConfiguration = _getDeepSeekR1GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = _getSlackGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = _getGoogleDriveGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = _getNotionGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = _getGithubGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.INTERCOM:
      agentConfiguration = _getIntercomGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        searchMCPServerView,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = _getDustGlobalAgent(auth, {
        settings,
        preFetchedDataSources,
        agentRouterMCPServerView,
        webSearchBrowseMCPServerView,
        searchMCPServerView,
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

// This is the list of global agents that we want to support in past conversations but we don't want
// to be accessible to users moving forward.
const RETIRED_GLOBAL_AGENTS_SID = [
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
  GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
  GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.GITHUB,
  GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
  GLOBAL_AGENTS_SID.GPT35_TURBO,
  GLOBAL_AGENTS_SID.INTERCOM,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
  GLOBAL_AGENTS_SID.MISTRAL_SMALL,
  GLOBAL_AGENTS_SID.NOTION,
  GLOBAL_AGENTS_SID.O1_MINI,
  GLOBAL_AGENTS_SID.SLACK,
];

export async function getGlobalAgents(
  auth: Authenticator,
  agentIds?: string[],
  variant: AgentFetchVariant = "full"
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

  const [
    preFetchedDataSources,
    globalAgentSettings,
    helperPromptInstance,
    agentRouterMCPServerView,
    webSearchBrowseMCPServerView,
    searchMCPServerView,
  ] = await Promise.all([
    variant === "full"
      ? getDataSourcesAndWorkspaceIdForGlobalAgents(auth)
      : null,
    GlobalAgentSettings.findAll({
      where: { workspaceId: owner.id },
    }),
    HelperAssistantPrompt.getInstance(),
    variant === "full"
      ? MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "agent_router"
        )
      : null,
    variant === "full"
      ? MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "web_search_&_browse"
        )
      : null,
    variant === "full"
      ? MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "search"
        )
      : null,
  ]);

  // If agentIds have been passed we fetch those. Otherwise we fetch them all, removing the retired
  // one (which will remove these models from the list of default agents in the product + list of
  // user agents).
  let agentsIdsToFetch =
    agentIds ??
    Object.values(GLOBAL_AGENTS_SID).filter(
      (sId) => !RETIRED_GLOBAL_AGENTS_SID.includes(sId)
    );

  const flags = await getFeatureFlags(owner);

  if (!flags.includes("openai_o1_feature")) {
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O1
    );
    agentsIdsToFetch = agentsIdsToFetch.filter(
      (sId) => sId !== GLOBAL_AGENTS_SID.O3
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
    getGlobalAgent({
      auth,
      sId,
      preFetchedDataSources,
      helperPromptInstance,
      globalAgentSettings,
      agentRouterMCPServerView,
      webSearchBrowseMCPServerView,
      searchMCPServerView,
    })
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
