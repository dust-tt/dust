import {
  getAgentConfigurations,
  getAgentLabelsByIds,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentModelDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";

export type AnalyticsAgentLabel = {
  name: string;
  pictureUrl: string | null;
  modelDisplayName: string;
  description: string;
};

const PRIVATE_AGENT_DESCRIPTION = "Private agent: description unavailable";

// Agent ids that no longer resolve to a configuration are absent from the
// returned map; callers drop them instead of surfacing a placeholder row.
export async function resolveAnalyticsAgentLabels(
  auth: Authenticator,
  agentIds: string[]
): Promise<Map<string, AnalyticsAgentLabel>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const agents = await getAgentConfigurations(auth, {
    agentIds,
    variant: "extra_light",
  });
  const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));

  const missingAgentIds = agentIds.filter((id) => !agentsById.has(id));
  const fallbackLabels =
    missingAgentIds.length > 0
      ? await getAgentLabelsByIds(auth, missingAgentIds)
      : [];
  const fallbackById = new Map(
    fallbackLabels.map((label) => [label.sId, label])
  );

  const labels = new Map<string, AnalyticsAgentLabel>();
  for (const agentId of agentIds) {
    const agent = agentsById.get(agentId);
    if (agent) {
      labels.set(agentId, {
        name: agent.name,
        pictureUrl: agent.pictureUrl,
        modelDisplayName: getAgentModelDisplayName(agent.model),
        description: agent.canRead
          ? agent.description
          : PRIVATE_AGENT_DESCRIPTION,
      });
      continue;
    }

    const fallback = fallbackById.get(agentId);
    if (fallback) {
      labels.set(agentId, {
        name: fallback.name,
        pictureUrl: fallback.pictureUrl,
        modelDisplayName: getAgentModelDisplayName(fallback.model),
        description: PRIVATE_AGENT_DESCRIPTION,
      });
    }
  }

  return labels;
}
