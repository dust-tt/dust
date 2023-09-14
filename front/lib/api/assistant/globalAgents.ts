import { Authenticator } from "@app/lib/auth";
import { DataSource } from "@app/lib/models";
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
  GPT4 = "gpt-4",
  Slack = "slack",
  Claude = "claude-2",
}
enum GLOBAL_AGENTS_ID {
  GPT4 = -1,
  Slack = -2,
  Claude = -3,
}

async function _getGPT4GlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: GLOBAL_AGENTS_ID.GPT4,
    sId: GLOBAL_AGENTS_SID.GPT4,
    name: "gpt4",
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: GLOBAL_AGENTS_ID.GPT4,
      prompt: "",
      model: {
        providerId: "openai",
        modelId: "gpt-4-0613",
      },
    },
    action: null,
  };
}

async function _getClaude2GlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: GLOBAL_AGENTS_ID.Claude,
    sId: GLOBAL_AGENTS_SID.Claude,
    name: "claude",
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: GLOBAL_AGENTS_ID.Claude,
      prompt: "",
      model: {
        providerId: "anthropic",
        modelId: "claude-2",
      },
    },
    action: null,
  };
}

async function _getSlackGlobalAgent(
  auth: Authenticator
): Promise<AgentConfigurationType | null> {
  const workspace = auth.workspace();
  const workspaceId = auth.workspace()?.id;
  if (!workspace || !workspaceId) {
    throw new Error("Cannot find Global Agent Configuration: no workspace.");
  }

  const slackDataSources = await DataSource.findAll({
    where: {
      connectorProvider: "slack",
      workspaceId: workspaceId,
    },
  });

  if (!slackDataSources) {
    return null;
  }

  return {
    id: GLOBAL_AGENTS_ID.Slack,
    sId: GLOBAL_AGENTS_SID.Slack,
    name: "slack",
    pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
    status: "active",
    scope: "global",
    generation: {
      id: GLOBAL_AGENTS_ID.Slack,
      prompt:
        "Answer the following question using all the data available in your Slack workspace.",
      model: {
        providerId: "openai",
        modelId: "gpt-3.5-turbo",
      },
    },
    action: {
      id: GLOBAL_AGENTS_ID.Slack,
      type: "retrieval_configuration",
      query: "auto",
      relativeTimeFrame: "auto",
      topK: 32,
      dataSources: slackDataSources.map((ds) => ({
        dataSourceId: ds.name,
        workspaceId: workspace.sId,
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
    case GLOBAL_AGENTS_SID.GPT4:
      return _getGPT4GlobalAgent();
    case GLOBAL_AGENTS_SID.Slack:
      return _getSlackGlobalAgent(auth);
    case GLOBAL_AGENTS_SID.Claude:
      return _getClaude2GlobalAgent();
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
    await _getGPT4GlobalAgent(),
    await _getClaude2GlobalAgent(),
  ];
  const slackAgent = await _getSlackGlobalAgent(auth);
  if (slackAgent) {
    globalAgents.push(slackAgent);
  }
  return globalAgents;
}
