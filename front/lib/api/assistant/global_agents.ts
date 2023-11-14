import fs from "fs";
import path from "path";
import { promisify } from "util";

const readFileAsync = promisify(fs.readFile);

import {
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_16K_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_32K_MODEL_CONFIG,
  MISTRAL_7B_DEFAULT_MODEL_CONFIG,
} from "@app/lib/assistant";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { DustAPI } from "@app/lib/dust_api";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import logger from "@app/logger/logger";
import {
  AgentConfigurationType,
  GlobalAgentStatus,
} from "@app/types/assistant/agent";
import { PlanType } from "@app/types/plan";

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
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }
  const model =
    plan.code === FREE_TEST_PLAN_CODE
      ? {
          providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
          modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
        }
      : {
          providerId: GPT_4_32K_MODEL_CONFIG.providerId,
          modelId: GPT_4_32K_MODEL_CONFIG.modelId,
        };
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.HELPER,
    version: 0,
    name: "help",
    description: "Help on how to use Dust",
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
    status: "active",
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
  plan,
  settings,
}: {
  plan: PlanType;
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
    version: 0,
    name: "gpt3.5-turbo",
    description:
      "OpenAI's cost-effective and high throughput model (16k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
    status: settings ? settings.status : "active",
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model:
        plan.code === FREE_TEST_PLAN_CODE
          ? {
              providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
              modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
            }
          : {
              providerId: GPT_3_5_TURBO_16K_MODEL_CONFIG.providerId,
              modelId: GPT_3_5_TURBO_16K_MODEL_CONFIG.modelId,
            },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getGPT4GlobalAgent({
  plan,
}: {
  plan: PlanType;
}): Promise<AgentConfigurationType> {
  const status =
    plan.code === FREE_TEST_PLAN_CODE ? "disabled_free_workspace" : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT4,
    version: 0,
    name: "gpt4",
    description: "OpenAI's most powerful and recent model (32k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status,
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: GPT_4_32K_MODEL_CONFIG.providerId,
        modelId: GPT_4_32K_MODEL_CONFIG.modelId,
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
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
    version: 0,
    name: "claude-instant",
    description:
      "Anthropic's low-latency and high throughput model (100k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status: settings ? settings.status : "active",
    scope: "global",
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
  settings,
  plan,
}: {
  settings: GlobalAgentSettings | null;
  plan: PlanType;
}): Promise<AgentConfigurationType> {
  const status =
    plan.code === FREE_TEST_PLAN_CODE ? "disabled_free_workspace" : "active";
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE,
    version: 0,
    name: "claude",
    description: "Anthropic's superior performance model (100k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status: settings ? settings.status : status,
    scope: "global",
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

async function _getMistralGlobalAgent({
  settings,
}: {
  settings: GlobalAgentSettings | null;
}): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.MISTRAL,
    version: 0,
    name: "mistral",
    description: "Mistral latest model (7B Instruct, 4k context).",
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
    status: settings ? settings.status : "disabled_by_admin",
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: MISTRAL_7B_DEFAULT_MODEL_CONFIG.providerId,
        modelId: MISTRAL_7B_DEFAULT_MODEL_CONFIG.modelId,
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
  }: {
    settings: GlobalAgentSettings | null;
    connectorProvider: ConnectorProvider;
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    description: string;
    pictureUrl: string;
    prompt: string;
  }
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(prodCredentials);

  const dsRes = await api.getDataSources(prodCredentials.workspaceId);
  if (dsRes.isErr()) {
    return null;
  }

  // Check if deactivated by an admin
  if (settings && settings.status === "disabled_by_admin") {
    return {
      id: -1,
      sId: agentId,
      version: 0,
      name: name,
      description,
      pictureUrl,
      status: "disabled_by_admin",
      scope: "global",
      generation: null,
      action: null,
    };
  }

  // Check if there's a data source for this agent
  const dataSources = dsRes.value.filter(
    (d) => d.connectorProvider === connectorProvider
  );
  if (dataSources.length === 0) {
    return {
      id: -1,
      sId: agentId,
      version: 0,
      name: name,
      description,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      generation: null,
      action: null,
    };
  }

  return {
    id: -1,
    sId: agentId,
    version: 0,
    name: name,
    description,
    pictureUrl,
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt,
      model:
        plan.code === FREE_TEST_PLAN_CODE
          ? {
              providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
              modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
            }
          : {
              providerId: GPT_4_32K_MODEL_CONFIG.providerId,
              modelId: GPT_4_32K_MODEL_CONFIG.modelId,
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
      dataSources: dataSources.map((ds) => ({
        dataSourceId: ds.name,
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
  }: {
    settings: GlobalAgentSettings | null;
  }
): Promise<AgentConfigurationType | null> {
  return await _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "google_drive",
    agentId: GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
    name: "googledrive",
    description: "An assistant with context on your Google Drives.",
    pictureUrl: "https://dust.tt/static/systemavatar/drive_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Google Drives.",
  });
}

async function _getSlackGlobalAgent(
  auth: Authenticator,
  {
    settings,
  }: {
    settings: GlobalAgentSettings | null;
  }
) {
  return await _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "slack",
    agentId: GLOBAL_AGENTS_SID.SLACK,
    name: "slack",
    description: "An assistant with context on your Slack Channels.",
    pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Slack channels.",
  });
}

async function _getGithubGlobalAgent(
  auth: Authenticator,
  {
    settings,
  }: {
    settings: GlobalAgentSettings | null;
  }
) {
  return await _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "github",
    agentId: GLOBAL_AGENTS_SID.GITHUB,
    name: "github",
    description:
      "An assistant with context on your Github Issues and Discussions.",
    pictureUrl: "https://dust.tt/static/systemavatar/github_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Github Issues and Discussions.",
  });
}

async function _getNotionGlobalAgent(
  auth: Authenticator,
  {
    settings,
  }: {
    settings: GlobalAgentSettings | null;
  }
): Promise<AgentConfigurationType | null> {
  return await _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "notion",
    agentId: GLOBAL_AGENTS_SID.NOTION,
    name: "notion",
    description: "An assistant with context on your Notion Spaces.",
    pictureUrl: "https://dust.tt/static/systemavatar/notion_avatar_full.png",
    prompt:
      "Assist the user based on the retrieved data from their Notion Spaces.",
  });
}

async function _getDustGlobalAgent(
  auth: Authenticator,
  {
    plan,
    settings,
  }: {
    plan: PlanType;
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
      name,
      description,
      pictureUrl,
      status: "disabled_by_admin",
      scope: "global",
      generation: null,
      action: null,
    };
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(prodCredentials);

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
      name,
      description,
      pictureUrl,
      status: "disabled_missing_datasource",
      scope: "global",
      generation: null,
      action: null,
    };
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST,
    version: 0,
    name,
    description,
    pictureUrl,
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt:
        "Assist the user based on the retrieved data from their workspace.",
      model:
        plan.code === FREE_TEST_PLAN_CODE
          ? {
              providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
              modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
            }
          : {
              providerId: GPT_4_32K_MODEL_CONFIG.providerId,
              modelId: GPT_4_32K_MODEL_CONFIG.modelId,
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
  sId: string | number
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find Global Agent Configuration: no workspace.");
  }
  const plan = auth.plan();
  if (!plan) {
    throw new Error("Unexpected `auth` without `plan`.");
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
      agentConfiguration = await _getGPT35TurboGlobalAgent({ settings, plan });
      break;
    case GLOBAL_AGENTS_SID.GPT4:
      agentConfiguration = await _getGPT4GlobalAgent({ plan });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      agentConfiguration = await _getClaudeInstantGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.CLAUDE:
      agentConfiguration = await _getClaudeGlobalAgent({ settings, plan });
      break;
    case GLOBAL_AGENTS_SID.MISTRAL:
      agentConfiguration = await _getMistralGlobalAgent({ settings });
      break;
    case GLOBAL_AGENTS_SID.SLACK:
      agentConfiguration = await _getSlackGlobalAgent(auth, { settings });
      break;
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      agentConfiguration = await _getGoogleDriveGlobalAgent(auth, { settings });
      break;
    case GLOBAL_AGENTS_SID.NOTION:
      agentConfiguration = await _getNotionGlobalAgent(auth, { settings });
      break;
    case GLOBAL_AGENTS_SID.GITHUB:
      agentConfiguration = await _getGithubGlobalAgent(auth, { settings });
      break;
    case GLOBAL_AGENTS_SID.DUST:
      agentConfiguration = await _getDustGlobalAgent(auth, { plan, settings });
      break;
    default:
      return null;
  }

  return agentConfiguration;
}

export async function getGlobalAgents(
  auth: Authenticator
): Promise<AgentConfigurationType[]> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find Global Agent Configuration: no workspace.");
  }

  // For now we retrieve them all
  // We will store them in the database later to allow admin enable them or not
  const agentCandidates = await Promise.all(
    Object.values(GLOBAL_AGENTS_SID).map((sId) => getGlobalAgent(auth, sId))
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
