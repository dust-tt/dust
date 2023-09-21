import fs from "fs";
import path from "path";
import { promisify } from "util";

const readFileAsync = promisify(fs.readFile);

import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { DustAPI } from "@app/lib/dust_api";
import logger from "@app/logger/logger";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { UserType } from "@app/types/user";

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
        logger.error("Error reading prompt file for @helper agent:", err);
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
 * - Add a unique SID in GLOBAL_AGENTS_SID.
 * - Add a unique ID in GLOBAL_AGENTS_ID.
 * - Add a case in getGlobalAgent with associated function.
 */

export enum GLOBAL_AGENTS_SID {
  HELPER = "helper",
  DUST = "dust",
  SLACK = "slack",
  GOOGLE_DRIVE = "google_drive",
  NOTION = "notion",
  GITHUB = "github",
  GPT4 = "gpt-4",
  CLAUDE = "claude-2",
  GPT35_TURBO = "gpt-3.5-turbo",
  CLAUDE_INSTANT = "claude-instant-1",
}

async function _getHelperGlobalAgent(
  user: UserType | null
): Promise<AgentConfigurationType> {
  let prompt = "";

  if (user) {
    prompt = `The user you're interacting with is ${user.name}. `;
  }

  const helperAssistantPromptInstance = HelperAssistantPrompt.getInstance();
  const staticPrompt = await helperAssistantPromptInstance.getStaticPrompt();

  if (staticPrompt) {
    prompt = prompt + staticPrompt;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.HELPER,
    version: 0,
    name: "helper",
    description:
      "Here to help with everything about assistant, and Dust's product in general",
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt: prompt,
      model: {
        providerId: "anthropic",
        modelId: "claude-2",
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getGPT35TurboGlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
    version: 0,
    name: "gpt3.5-turbo",
    description: "OpenAI's cost-effective and high throughput model.",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: "openai",
        modelId: "gpt-3.5-turbo",
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getGPT4GlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT4,
    version: 0,
    name: "gpt4",
    description: "OpenAI's most powerful model.",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: "openai",
        modelId: "gpt-4",
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getClaudeInstantGlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
    version: 0,
    name: "claude-instant",
    description: "Anthropic's low-latency and high throughput model.",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: "anthropic",
        modelId: "claude-instant-1.2",
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getClaudeGlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.CLAUDE,
    version: 0,
    name: "claude",
    description: "Anthropic's superior performance model.",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt: "",
      model: {
        providerId: "anthropic",
        modelId: "claude-2",
      },
      temperature: 0.7,
    },
    action: null,
  };
}

async function _getManagedDataSourceAgent(
  auth: Authenticator,
  connectorProvider: ConnectorProvider,
  agentId: GLOBAL_AGENTS_SID,
  name: string,
  description: string,
  pictureUrl: string,
  prompt: string
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(prodCredentials);

  const dsRes = await api.getDataSources(prodCredentials.workspaceId);
  if (dsRes.isErr()) {
    return null;
  }

  const dataSources = dsRes.value.filter(
    (d) => d.connectorProvider === connectorProvider
  );

  if (dataSources.length === 0) {
    return null;
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
      model: {
        providerId: "openai",
        modelId: "gpt-4",
      },
      temperature: 0.4,
    },
    action: {
      id: -1,
      sId: agentId + "-action",
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: 16,
      dataSources: dataSources.map((ds) => ({
        dataSourceId: ds.name,
        workspaceId: prodCredentials.workspaceId,
        filter: { tags: null, parents: null },
      })),
    },
  };
}

async function _getGoogleDriveGlobalAgent(
  auth: Authenticator
): Promise<AgentConfigurationType | null> {
  return await _getManagedDataSourceAgent(
    auth,
    "google_drive",
    GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
    "googledrive",
    "An assistant with context on your Google Drives.",
    "https://dust.tt/static/systemavatar/drive_avatar_full.png",
    "Assist the user based on the retrieved data from their Google Drives."
  );
}

async function _getSlackGlobalAgent(auth: Authenticator) {
  return await _getManagedDataSourceAgent(
    auth,
    "slack",
    GLOBAL_AGENTS_SID.SLACK,
    "slack",
    "An assistant with context on your Slack Channels.",
    "https://dust.tt/static/systemavatar/slack_avatar_full.png",
    "Assist the user based on the retrieved data from their Slack Channels."
  );
}

async function _getGithubGlobalAgent(auth: Authenticator) {
  return await _getManagedDataSourceAgent(
    auth,
    "github",
    GLOBAL_AGENTS_SID.GITHUB,
    "github",
    "An assistant with context on your Github Issues and Discussions.",
    "https://dust.tt/static/systemavatar/github_avatar_full.png",
    "Assist the user based on the retrieved data from their Github Issues and Discussions."
  );
}

async function _getNotionGlobalAgent(
  auth: Authenticator
): Promise<AgentConfigurationType | null> {
  return await _getManagedDataSourceAgent(
    auth,
    "notion",
    GLOBAL_AGENTS_SID.NOTION,
    "notion",
    "An assistant with context on your Notion Spaces.",
    "https://dust.tt/static/systemavatar/notion_avatar_full.png",
    "Assist the user based on the retrieved data from their Notion Spaces."
  );
}

async function _getDustGlobalAgent(
  auth: Authenticator
): Promise<AgentConfigurationType | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
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
    return null;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST,
    version: 0,
    name: "Dust",
    description:
      "An assistant with context on your managed and static data sources.",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt:
        "Assist the user based on the retrieved data from their workspace.",
      model: {
        providerId: "openai",
        modelId: "gpt-4",
      },
      temperature: 0.4,
    },
    action: {
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST + "-action",
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: 16,
      dataSources: dataSources.map((ds) => ({
        dataSourceId: ds.name,
        workspaceId: prodCredentials.workspaceId,
        filter: { tags: null, parents: null },
      })),
    },
  };
}

/**
 * EXPORTED FUNCTIONS
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
  const user = auth.user();

  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      return _getHelperGlobalAgent(user);
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      return _getGPT35TurboGlobalAgent();
    case GLOBAL_AGENTS_SID.GPT4:
      return _getGPT4GlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      return _getClaudeInstantGlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE:
      return _getClaudeGlobalAgent();
    case GLOBAL_AGENTS_SID.SLACK:
      return _getSlackGlobalAgent(auth);
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      return _getGoogleDriveGlobalAgent(auth);
    case GLOBAL_AGENTS_SID.NOTION:
      return _getNotionGlobalAgent(auth);
    case GLOBAL_AGENTS_SID.GITHUB:
      return _getGithubGlobalAgent(auth);
    case GLOBAL_AGENTS_SID.DUST:
      return _getDustGlobalAgent(auth);
    default:
      return null;
  }
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
