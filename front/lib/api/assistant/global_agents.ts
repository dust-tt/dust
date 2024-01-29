import fs from "fs";
import path from "path";
import { promisify } from "util";

const readFileAsync = promisify(fs.readFile);

import type {
  AgentConfigurationType,
  ConnectorProvider,
  DataSourceType,
} from "@dust-tt/types";
import type { GlobalAgentStatus } from "@dust-tt/types";
import {
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_4_TURBO_0125_MODEL_CONFIG,
} from "@dust-tt/types";
import {
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";

import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";

class HelperAssistantPrompt {
  private static instance: HelperAssistantPrompt;
  private staticPrompt: string | null = null;

  public static getInstance(): HelperAssistantPrompt {
    if (!HelperAssistantPrompt.instance) {
      HelperAssistantPrompt.instance = new HelperAssistantPrompt();
    }
    return HelperAssistantPrompt.instance;
  }

  public async getStaticPrompt(): Promise<string | null> {
    if (this.staticPrompt === null) {
      try {
        const filePath = path.join(
          process.cwd(),
          "prompt/global_agent_helper_prompt.md"
        );
        this.staticPrompt = await readFileAsync(filePath, "utf-8");
      } catch (err) {
        logger.error("Error reading prompt file for @help agent:", err);
        return null;
      }
    }
    return this.staticPrompt;
  }
}

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID (lib/assitsant.ts)
 * - Add a case in getGlobalAgent with associated function.
 */
async function _getHelperGlobalAgent(
  auth: Authenticator
): Promise<AgentConfigurationType> {
  let prompt = "";

  const user = auth.user();
  if (user) {
    const role = auth.role();
    prompt = `The user you're interacting with is granted with the role ${role}. Their name is ${user.fullName}. `;
  }

  const helperAssistantPromptInstance = HelperAssistantPrompt.getInstance();
  const staticPrompt = await helperAssistantPromptInstance.getStaticPrompt();

  if (staticPrompt) {
    prompt = prompt + staticPrompt;
  }
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const model = !auth.isUpgraded()
    ? {
        providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
        modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
      }
    : {
        providerId: GPT_4_TURBO_0125_MODEL_CONFIG.providerId,
        modelId: GPT_4_TURBO_0125_MODEL_CONFIG.modelId,
      };
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.HELPER,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "help",
    description: "Help on how to use Dust",
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
    status: "active",
    userListStatus: "in-list",
    scope: "global",
    generation: {
      id: -1,
      prompt: prompt,
      model,
      temperature: 0.2,
    },
    action: null,
  };
}

async function _getGPT35TurboGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  const status = settings ? settings.status : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "gpt3.5-turbo",
    description:
      "OpenAI's cost-effective and high throughput model (16k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
        modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getGPT4GlobalAgent({
  auth,
}: {
  auth: Authenticator;
}): Promise<AgentConfigurationType> {
  const status = !auth.isUpgraded() ? "disabled_free_workspace" : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT4,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "gpt4",
    description: "OpenAI's most powerful and recent model (128k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: GPT_4_TURBO_0125_MODEL_CONFIG.providerId,
        modelId: GPT_4_TURBO_0125_MODEL_CONFIG.modelId,
      },

      temperature: 0.7,
    },
    action: null,
  };
}

async function _getClaudeInstantGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  const status = settings ? settings.status : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-instant",
    description:
      "Anthropic's low-latency and high throughput model (100k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.modelId,
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getClaudeGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  const status = !auth.isUpgraded() ? "disabled_free_workspace" : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude",
    description: "Anthropic's superior performance model (200k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status: settings ? settings.status : status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: CLAUDE_DEFAULT_MODEL_CONFIG.providerId,
        modelId: CLAUDE_DEFAULT_MODEL_CONFIG.modelId,
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getMistralMediumGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
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
    description: "Mistral latest larger model (32k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: MISTRAL_MEDIUM_MODEL_CONFIG.providerId,
        modelId: MISTRAL_MEDIUM_MODEL_CONFIG.modelId,
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getMistralSmallGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  const status = settings ? settings.status : "disabled_by_admin";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.MISTRAL_SMALL,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "mistral-small",
    description: "Mistral latest model (8x7B Instruct, 32k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: MISTRAL_SMALL_MODEL_CONFIG.providerId,
        modelId: MISTRAL_SMALL_MODEL_CONFIG.modelId,
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getGeminiProGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  const status = settings ? settings.status : "disabled_by_admin";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GEMINI_PRO,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "gemini-pro",
    description:
      "Google's our best model for scaling across a wide range of tasks (8k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/gemini_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    generation: {
      id: -1,
      prompt: `Never start your messages with "[assistant:"`,
      model: {
        providerId: GEMINI_PRO_DEFAULT_MODEL_CONFIG.providerId,
        modelId: GEMINI_PRO_DEFAULT_MODEL_CONFIG.modelId,
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getManagedDataSourceAgent(
  auth: Authenticator,
  {
    settings,
    connectorProvider,
    agentId,
    name,
    description,
    pictureUrl,
    prompt,
    dataSources,
  }: {
    settings: GlobalAgentSettings | null;
    connectorProvider: ConnectorProvider;
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    description: string;
    pictureUrl: string;
    prompt: string;
    dataSources: DataSourceType[];
  }
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);

  // Check if deactivated by an admin
  if (settings && settings.status === "disabled_by_admin") {
    return {
      id: -1,
      sId: agentId,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name: name,
      description,
      pictureUrl,
      status: "disabled_by_admin",
      scope: "global",
      userListStatus: "not-in-list",
      generation: null,
      action: null,
    };
  }

  // Check if there's a data source for this agent
  const filteredDataSources = dataSources.filter(
    (d) => d.connectorProvider === connectorProvider
  );
  if (filteredDataSources.length === 0) {
    return {
      id: -1,
      sId: agentId,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name: name,
      description,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      userListStatus: "not-in-list",
      generation: null,
      action: null,
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
    pictureUrl,
    status: "active",
    scope: "global",
    userListStatus: "in-list",
    generation: {
      id: -1,
      prompt,
      model: !auth.isUpgraded()
        ? {
            providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
            modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
          }
        : {
            providerId: GPT_4_TURBO_0125_MODEL_CONFIG.providerId,
            modelId: GPT_4_TURBO_0125_MODEL_CONFIG.modelId,
          },
      temperature: 0.4,
    },
    action: {
      id: -1,
      sId: agentId + "-action",
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: "auto",
      dataSources: filteredDataSources.map((ds) => ({
        dataSourceId: ds.name,
        // We use prodCredentials to make sure we are using the right workspaceId. In development
        // this is the production Dust use case, in production this is the auth's workspace.
        workspaceId: prodCredentials.workspaceId,
        filter: { tags: null, parents: null },
      })),
    },
  };
}

async function _getGoogleDriveGlobalAgent(
  auth: Authenticator,
  {
    settings,
    dataSources,
  }: {
    settings: GlobalAgentSettings | null;
    dataSources: DataSourceType[];
  }
): Promise<AgentConfigurationType | null> {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "google_drive",
    agentId: GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
    name: "googledrive",
    description: "An assistant with context on your Google Drives.",
    pictureUrl: "https://dust.tt/static/systemavatar/drive_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Google Drives.",
    dataSources,
  });
}

async function _getSlackGlobalAgent(
  auth: Authenticator,
  {
    settings,
    dataSources,
  }: {
    settings: GlobalAgentSettings | null;
    dataSources: DataSourceType[];
  }
) {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "slack",
    agentId: GLOBAL_AGENTS_SID.SLACK,
    name: "slack",
    description: "An assistant with context on your Slack Channels.",
    pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Slack channels.",
    dataSources,
  });
}

async function _getGithubGlobalAgent(
  auth: Authenticator,
  {
    settings,
    dataSources,
  }: {
    settings: GlobalAgentSettings | null;
    dataSources: DataSourceType[];
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
    prompt:
      "Assist the user based on the retrieved data from their Github Issues and Discussions.",
    dataSources,
  });
}

async function _getNotionGlobalAgent(
  auth: Authenticator,
  {
    settings,
    dataSources,
  }: {
    settings: GlobalAgentSettings | null;
    dataSources: DataSourceType[];
  }
): Promise<AgentConfigurationType | null> {
  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "notion",
    agentId: GLOBAL_AGENTS_SID.NOTION,
    name: "notion",
    description: "An assistant with context on your Notion Spaces.",
    pictureUrl: "https://dust.tt/static/systemavatar/notion_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Notion Spaces.",
    dataSources,
  });
}

async function _getDustGlobalAgent(
  auth: Authenticator,
  {
    settings,
  }: {
    settings: GlobalAgentSettings | null;
  }
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const name = "dust";
  const description = "An assistant with context on your company data.";
  const pictureUrl = "https://dust.tt/static/systemavatar/dust_avatar_full.png";

  if (settings && settings.status === "disabled_by_admin") {
    return {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name,
      description,
      pictureUrl,
      status: "disabled_by_admin",
      scope: "global",
      userListStatus: "not-in-list",
      generation: null,
      action: null,
    };
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(prodCredentials, logger);

  const dsRes = await api.getDataSources(prodCredentials.workspaceId);
  if (dsRes.isErr()) {
    return null;
  }

  const dataSources = dsRes.value.filter(
    (d) => d.assistantDefaultSelected === true
  );

  if (dataSources.length === 0) {
    return {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST,
      version: 0,
      versionCreatedAt: null,
      versionAuthorId: null,
      name,
      description,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      userListStatus: "not-in-list",
      generation: null,
      action: null,
    };
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    pictureUrl,
    status: "active",
    scope: "global",
    userListStatus: "in-list",
    generation: {
      id: -1,
      prompt:
        "Assist the user based on the retrieved data from their workspace. Unlesss the user explicitely asks for a detailed answer, you goal is to provide a quick answer to their question.",
      model: !auth.isUpgraded()
        ? {
            providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
            modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
          }
        : {
            providerId: GPT_4_TURBO_0125_MODEL_CONFIG.providerId,
            modelId: GPT_4_TURBO_0125_MODEL_CONFIG.modelId,
          },
      temperature: 0.4,
    },
    action: {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST + "-action",
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: "auto",
      dataSources: dataSources.map((ds) => ({
        dataSourceId: ds.name,
        workspaceId: prodCredentials.workspaceId,
        filter: { tags: null, parents: null },
      })),
    },
  };
}

/**
 * Exported functions
 */

export function isGlobalAgentId(sId: string): boolean {
  return (Object.values(GLOBAL_AGENTS_SID) as string[]).includes(sId);
}

export async function getGlobalAgent(
  auth: Authenticator,
  sId: string | number,
  preFetchedDataSources: DataSourceType[] | null
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find Global Agent Configuration: no workspace.");
  }

  if (preFetchedDataSources === null) {
    const prodCredentials = await prodAPICredentialsForOwner(owner);
    const api = new DustAPI(prodCredentials, logger);

    const dsRes = await api.getDataSources(prodCredentials.workspaceId);
    if (dsRes.isErr()) {
      return null;
    }
    preFetchedDataSources = dsRes.value;
  }

  const settings = await GlobalAgentSettings.findOne({
    where: { workspaceId: owner.id, agentId: sId },
  });
  let agentConfiguration: AgentConfigurationType | null = null;
  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      agentConfiguration = await _getHelperGlobalAgent(auth);
      break;
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      agentConfiguration = await _getGPT35TurboGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.GPT4:
      agentConfiguration = await _getGPT4GlobalAgent({ auth });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      agentConfiguration = await _getClaudeInstantGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE:
      agentConfiguration = await _getClaudeGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      agentConfiguration = await _getMistralMediumGlobalAgent({
        settings,
        auth,
      });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      agentConfiguration = await _getMistralSmallGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      agentConfiguration = await _getGeminiProGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = await _getSlackGlobalAgent(auth, {
        settings,
        dataSources: preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = await _getGoogleDriveGlobalAgent(auth, {
        settings,
        dataSources: preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = await _getNotionGlobalAgent(auth, {
        settings,
        dataSources: preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = await _getGithubGlobalAgent(auth, {
        settings,
        dataSources: preFetchedDataSources,
      });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = await _getDustGlobalAgent(auth, { settings });
      break;
    default:
      return null;
  }

  return agentConfiguration;
}

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

  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find Global Agent Configuration: no workspace.");
  }

  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(prodCredentials, logger);

  const dsRes = await api.getDataSources(prodCredentials.workspaceId);
  if (dsRes.isErr()) {
    throw new Error("Failed to retrieve data sources.");
  }

  const preFetchedDataSources = dsRes.value;

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = await Promise.all(
    Object.values(agentIds ?? GLOBAL_AGENTS_SID).map((sId) =>
      getGlobalAgent(auth, sId, preFetchedDataSources)
    )
  );

  const globalAgents: AgentConfigurationType[] = [];

  for (const agentFetcherResult of agentCandidates) {
    if (agentFetcherResult) {
      globalAgents.push(agentFetcherResult);
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
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

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
