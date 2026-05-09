import { getAgentsUsage } from "@app/lib/api/assistant/agent_usage";
import type { SortStrategyType } from "@app/lib/api/assistant/configuration/types";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import type {
  AgentsGetViewType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import keyBy from "lodash/keyBy";
import omit from "lodash/omit";

interface ListAgentConfigurationsForViewOptions {
  view: AgentsGetViewType;
  limit?: number;
  sort?: SortStrategyType;
  withUsage?: boolean;
  withAuthors?: boolean;
  withEditors?: boolean;
  withFeedbacks?: boolean;
}

export async function listAgentConfigurationsForView(
  auth: Authenticator,
  {
    view,
    limit,
    sort,
    withUsage,
    withAuthors,
    withEditors,
    withFeedbacks,
  }: ListAgentConfigurationsForViewOptions
): Promise<LightAgentConfigurationType[]> {
  let agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: view,
    variant: "light",
    limit,
    sort,
  });

  if (withUsage) {
    agents = await addUsage(auth, agents, limit);
  }

  if (withAuthors) {
    agents = await addRecentAuthors(auth, agents);
  }

  if (withEditors) {
    agents = await addEditors(auth, agents);
  }

  if (withFeedbacks) {
    agents = await addFeedbacks(auth, agents);
  }

  return agents;
}

async function addUsage(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  limit: number | undefined
): Promise<LightAgentConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const mentionCounts = await runOnRedis(
    { origin: "agent_usage" },
    async (redis) =>
      getAgentsUsage({
        providedRedis: redis,
        workspaceId: owner.sId,
        limit: limit ?? -1,
      })
  );
  const usageMap = keyBy(mentionCounts, "agentId");
  return agents.map((agent) =>
    usageMap[agent.sId]
      ? { ...agent, usage: omit(usageMap[agent.sId], ["agentId"]) }
      : agent
  );
}

async function addRecentAuthors(
  auth: Authenticator,
  agents: LightAgentConfigurationType[]
): Promise<LightAgentConfigurationType[]> {
  const recentAuthors = await getAgentsRecentAuthors({ auth, agents });
  return agents.map((agent, index) => ({
    ...agent,
    lastAuthors: recentAuthors[index],
  }));
}

async function addEditors(
  auth: Authenticator,
  agents: LightAgentConfigurationType[]
): Promise<LightAgentConfigurationType[]> {
  const editors = await getAgentsEditors(auth, agents);
  return agents.map((agent) => ({
    ...agent,
    editors: editors[agent.sId],
  }));
}

async function addFeedbacks(
  auth: Authenticator,
  agents: LightAgentConfigurationType[]
): Promise<LightAgentConfigurationType[]> {
  const nonGlobalAgentIds = agents
    .filter((agent) => agent.scope !== "global")
    .map((agent) => agent.sId);
  const feedbacks =
    await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
      auth,
      nonGlobalAgentIds,
      30
    );
  const feedbackByAgentId = new Map<string, { up: number; down: number }>();
  for (const f of feedbacks) {
    const current = feedbackByAgentId.get(f.agentConfigurationId) ?? {
      up: 0,
      down: 0,
    };
    if (f.thumbDirection === "up") {
      current.up = f.count;
    } else if (f.thumbDirection === "down") {
      current.down = f.count;
    }
    feedbackByAgentId.set(f.agentConfigurationId, current);
  }
  return agents.map((agent) => ({
    ...agent,
    feedbacks: feedbackByAgentId.get(agent.sId) ?? { up: 0, down: 0 },
  }));
}
