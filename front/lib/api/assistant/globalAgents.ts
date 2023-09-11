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
  GPT4 = "6b5203c158",
  Slack = "4c974a7ac9",
}
enum GLOBAL_AGENTS_ID {
  GPT4 = -1,
  Slack = -2,
}

async function _getGPT4GlobalAgent(): Promise<AgentConfigurationType> {
  return {
    id: GLOBAL_AGENTS_ID.GPT4,
    sId: GLOBAL_AGENTS_SID.GPT4,
    name: "GPT4",
    pictureUrl: null,
    status: "active",
    scope: "global",
    generation: {
      id: 0,
      prompt: "Answer the following question:",
      model: {
        providerId: "openai",
        modelId: "gpt-4-0613",
      },
    },
    action: null,
  };
}

async function _getSlackGlobalAgent(
  auth: Authenticator
): Promise<AgentConfigurationType> {
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

  return {
    id: GLOBAL_AGENTS_ID.Slack,
    sId: GLOBAL_AGENTS_SID.Slack,
    name: "Slack",
    pictureUrl: null,
    status: "active",
    scope: "global",
    generation: {
      id: 0,
      prompt:
        "Answer the following question using all the data available in your Slack workspace.",
      model: {
        providerId: "openai",
        modelId: "gpt-3.5-turbo",
      },
    },
    action: {
      id: 0,
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

export function isGlobalAgent(sId: string): boolean {
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
    case GLOBAL_AGENTS_ID.Slack:
      return _getSlackGlobalAgent(auth);
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
  return [await _getGPT4GlobalAgent(), await _getSlackGlobalAgent(auth)];
}
