import {
  getAgentConfigurations,
  getAgentLabelsByIds,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentModelDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { removeNulls } from "@app/types/shared/utils/general";

export type AnalyticsAgentLabel = {
  name: string;
  pictureUrl: string | null;
  modelId: string;
  modelDisplayName: string;
  description: string;
};

const PRIVATE_AGENT_DESCRIPTION = "Private agent: description unavailable";

function privateAgentDescription(authorEmail: string | null | undefined) {
  return authorEmail
    ? `Private agent owned by ${authorEmail}`
    : PRIVATE_AGENT_DESCRIPTION;
}

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

  const authorModelIds = auth.isManager()
    ? removeNulls([
        ...agents
          .filter((agent) => !agent.canRead)
          .map((agent) => agent.versionAuthorId),
        ...fallbackLabels.map((label) => label.authorModelId),
      ])
    : [];
  const authors =
    authorModelIds.length > 0
      ? await UserResource.fetchByModelIds(authorModelIds)
      : [];
  const authorEmailByModelId = new Map(
    authors.map((author) => [author.id, author.email])
  );

  const labels = new Map<string, AnalyticsAgentLabel>();
  for (const agentId of agentIds) {
    const agent = agentsById.get(agentId);
    if (agent) {
      const authorEmail = agent.versionAuthorId
        ? authorEmailByModelId.get(agent.versionAuthorId)
        : null;
      labels.set(agentId, {
        name: agent.name,
        pictureUrl: agent.pictureUrl,
        modelId: agent.model.modelId,
        modelDisplayName: getAgentModelDisplayName(agent.model),
        description: agent.canRead
          ? agent.description
          : privateAgentDescription(authorEmail),
      });
      continue;
    }

    const fallback = fallbackById.get(agentId);
    if (fallback) {
      labels.set(agentId, {
        name: fallback.name,
        pictureUrl: fallback.pictureUrl,
        modelId: fallback.model.modelId,
        modelDisplayName: getAgentModelDisplayName(fallback.model),
        description: privateAgentDescription(
          authorEmailByModelId.get(fallback.authorModelId)
        ),
      });
    }
  }

  return labels;
}
