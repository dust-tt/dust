import { Authenticator, prodAPICredentialsForOwner } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { AgentConfigurationType } from "@app/types/assistant/agent";

/**
 * GLOBAL AGENTS CONFIGURATION
 *
 * To add an agent:
 * - Add a unique SID in GLOBAL_AGENTS_SID.
 * - Add a unique ID in GLOBAL_AGENTS_ID.
 * - Add a case in getGlobalAgent with associated function.
 */

enum GLOBAL_AGENTS_SID {
  GPT35_TURBO = "gpt-3.5-turbo",
  GPT4 = "gpt-4",
  CLAUDE_INSTANT = "claude-instant-1",
  CLAUDE = "claude-2",
  SLACK = "slack",
  DUST = "dust",
}

async function _getGPT35TurboGlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
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

async function _getSlackGlobalAgent(
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

  const slackDataSources = dsRes.value.filter(
    (d) => d.connectorProvider === "slack"
  );

  if (slackDataSources.length === 0) {
    return null;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.SLACK,
    name: "slack",
    description: "An assistant with context on your Slack workspace.",
    pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: -1,
      prompt:
        "Assist the user based on the retrieved data from their Slack workspace.",
      model: {
        providerId: "openai",
        modelId: "gpt-4",
      },
      temperature: 0.4,
    },
    action: {
      id: -1,
      sId: GLOBAL_AGENTS_SID.SLACK + "-action",
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: 16,
      dataSources: slackDataSources.map((ds) => ({
        dataSourceId: ds.name,
        workspaceId: prodCredentials.workspaceId,
        filter: { tags: null, parents: null },
      })),
    },
  };
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

  switch (sId) {
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
  const globalAgents = [
    await _getGPT35TurboGlobalAgent(),
    await _getGPT4GlobalAgent(),
    await _getClaudeInstantGlobalAgent(),
    await _getClaudeGlobalAgent(),
  ];

  const slackAgent = await _getSlackGlobalAgent(auth);
  if (slackAgent) {
    globalAgents.push(slackAgent);
  }
  const dustAgent = await _getDustGlobalAgent(auth);
  if (dustAgent) {
    globalAgents.push(dustAgent);
  }

  return globalAgents;
}
