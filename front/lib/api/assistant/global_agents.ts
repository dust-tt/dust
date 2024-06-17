import fs from "fs";
import path from "path";
import { promisify } from "util";

const readFileAsync = promisify(fs.readFile);

import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
  ConnectorProvider,
  DataSourceType,
  GlobalAgentStatus,
} from "@dust-tt/types";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  isProviderWhitelisted,
} from "@dust-tt/types";
import {
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";

import { DEFAULT_RETRIEVAL_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";

// Used when returning an agent with status 'disabled_by_admin'
const dummyModelConfiguration = {
  providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
  modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
  temperature: 0,
};

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
    userListStatus: "in-list",
    scope: "global",
    model: model,
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
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
    description: GPT_3_5_TURBO_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
      modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
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
    description: GPT_4_TURBO_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: GPT_4_TURBO_MODEL_CONFIG.providerId,
      modelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getClaudeInstantGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
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
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getClaude2GlobalAgent({
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
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: CLAUDE_2_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_2_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },

    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getClaude3HaikuGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  const status = settings ? settings.status : "disabled_by_admin";

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: "claude-3-haiku",
    description: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.description,
    instructions:
      "Your name is claude-3-haiku, but you are not meant to generate haikus." +
      " Users will mention you using @claude-3-haiku, but this does not mean" +
      " they are asking you to generate a haiku. Just answer their questions" +
      " and ignore the fact that they are referring to you as claude-3-haiku." +
      " Do not ever talk about haikus or the fact that you have been asked to" +
      " never generate haikus. Just answer the questions as if they were not" +
      " mentioning haikus at all.",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getClaude3SonnetGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
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
    name: "claude-3-sonnet",
    description: CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG.description,
    instructions:
      "Your name is claude-3-sonnet, but that does not mean you're expected to generate sonnets unless instructed.",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getClaude3OpusGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
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
    name: "claude-3",
    description: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },

    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getMistralLargeGlobalAgent({
  auth,
  settings,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
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
    name: "mistral-large",
    description: MISTRAL_LARGE_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: MISTRAL_LARGE_MODEL_CONFIG.providerId,
      modelId: MISTRAL_LARGE_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
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
    description: MISTRAL_MEDIUM_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: MISTRAL_MEDIUM_MODEL_CONFIG.providerId,
      modelId: MISTRAL_MEDIUM_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
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
    description: MISTRAL_SMALL_MODEL_CONFIG.description,
    instructions: null,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status,
    scope: "global",
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: MISTRAL_SMALL_MODEL_CONFIG.providerId,
      modelId: MISTRAL_SMALL_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

async function _getGeminiProGlobalAgent({
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
    userListStatus: status === "active" ? "in-list" : "not-in-list",
    model: {
      providerId: GEMINI_PRO_DEFAULT_MODEL_CONFIG.providerId,
      modelId: GEMINI_PRO_DEFAULT_MODEL_CONFIG.modelId,
      temperature: 0.7,
    },
    actions: [],
    maxToolsUsePerRun: 0,
    templateId: null,
  };
}

// Meta prompt used to incentivize the model to answer with brevity.
const BREVITY_PROMPT =
  "When replying to the user, go straight to the point. Answer with precision and brevity.";

async function _getManagedDataSourceAgent(
  auth: Authenticator,
  {
    settings,
    connectorProvider,
    agentId,
    name,
    description,
    instructions,
    pictureUrl,
    dataSources,
  }: {
    settings: GlobalAgentSettings | null;
    connectorProvider: ConnectorProvider;
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    description: string;
    instructions: string | null;
    pictureUrl: string;
    dataSources: DataSourceType[];
  }
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);

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
      userListStatus: "not-in-list",
      model,
      actions: [],
      maxToolsUsePerRun: 0,
      templateId: null,
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
      instructions: null,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      userListStatus: "not-in-list",
      model,
      actions: [],
      maxToolsUsePerRun: 0,
      templateId: null,
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
    userListStatus: "in-list",
    model,
    actions: [
      {
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
        name: DEFAULT_RETRIEVAL_ACTION_NAME,
        description: `The user's ${connectorProvider} data source.`,
      },
    ],
    maxToolsUsePerRun: 1,
    templateId: null,
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
    instructions:
      "Assist the user based on the retrieved data from their Google Drives." +
      `\n${BREVITY_PROMPT}`,
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
    instructions:
      "Assist the user based on the retrieved data from their Slack channels." +
      `\n${BREVITY_PROMPT}`,
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
    instructions:
      "Assist the user based on the retrieved data from their Github Issues and Discussions." +
      `\n${BREVITY_PROMPT}`,
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
    instructions:
      "Assist the user based on the retrieved data from their Notion Spaces." +
      `\n${BREVITY_PROMPT}`,
    dataSources,
  });
}

async function _getIntercomGlobalAgent(
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
    connectorProvider: "intercom",
    agentId: GLOBAL_AGENTS_SID.INTERCOM,
    name: "intercom",
    description: "An assistant with context on your Intercom Help Center data.",
    pictureUrl: "https://dust.tt/static/systemavatar/intercom_avatar_full.png",
    instructions:
      "Assist the user based on the retrieved data from their Intercom Workspace." +
      `\n${BREVITY_PROMPT}`,
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
      userListStatus: "not-in-list",
      model,
      actions: [],
      maxToolsUsePerRun: 0,
      templateId: null,
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
      instructions: null,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      userListStatus: "not-in-list",
      model,
      actions: [],
      maxToolsUsePerRun: 0,
      templateId: null,
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
    instructions:
      "Assist the user based on the retrieved data from their workspace." +
      `\n${BREVITY_PROMPT}`,
    pictureUrl,
    status: "active",
    scope: "global",
    userListStatus: "in-list",
    model,
    actions: [
      {
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
        name: DEFAULT_RETRIEVAL_ACTION_NAME,
        description: `The user's entire workspace data sources`,
      },
    ],
    maxToolsUsePerRun: 1,
    templateId: null,
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
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      agentConfiguration = await _getClaude3OpusGlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      agentConfiguration = await _getClaude3SonnetGlobalAgent({
        auth,
        settings,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      agentConfiguration = await _getClaude3HaikuGlobalAgent({
        settings,
      });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      agentConfiguration = await _getClaude2GlobalAgent({ auth, settings });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      agentConfiguration = await _getMistralLargeGlobalAgent({
        settings,
        auth,
      });
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
      agentConfiguration = await _getGeminiProGlobalAgent({ auth, settings });
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
    case GLOBAL_AGENTS_SID.INTERCOM:
      agentConfiguration = await _getIntercomGlobalAgent(auth, {
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

// This is the list of global agents that we want to support in past conversations but we don't want
// to be accessible to users moving forward.
const RETIRED_GLOABL_AGENTS_SID = [
  GLOBAL_AGENTS_SID.CLAUDE_2,
  GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
  GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
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

  // If agentIds have been passed we fetch those. Otherwise we fetch them all, removing the retired
  // one (which will remove these models from the list of default agents in the product + list of
  // user assistants).
  const agentsIdsToFetch =
    agentIds ??
    Object.values(GLOBAL_AGENTS_SID).filter(
      (sId) => !RETIRED_GLOABL_AGENTS_SID.includes(sId)
    );

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = await Promise.all(
    agentsIdsToFetch.map((sId) =>
      getGlobalAgent(auth, sId, preFetchedDataSources)
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
