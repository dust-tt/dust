import { getAgentModelDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { removeNulls } from "@app/types/shared/utils/general";

export type AnalyticsAgentLabel = {
  name: string;
  pictureUrl: string | null;
  modelId: string;
  modelDisplayName: string;
  description: string;
  scope: AgentConfigurationScope;
};

const PRIVATE_AGENT_DESCRIPTION = "Private agent: description unavailable";

function privateAgentDescription(authorEmail: string | null | undefined) {
  return authorEmail
    ? `Private agent owned by ${authorEmail}`
    : PRIVATE_AGENT_DESCRIPTION;
}

// Agent ids that no longer resolve to a configuration are absent from the
// returned map; callers drop them instead of surfacing a placeholder row.
/**
 * @cc [owner:sfriquet,label:security] analytics-labels-through-agent-resource
 * Agents MUST be resolved through `AgentResource`. Without `read`, the description MUST be a
 * placeholder, naming the author only if the caller holds `list`.
 */
export async function resolveAnalyticsAgentLabels(
  auth: Authenticator,
  agentIds: string[]
): Promise<Map<string, AnalyticsAgentLabel>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const agents = await AgentResource.fetchByIds(auth, agentIds);

  const authorModelIds = removeNulls(
    agents
      .filter((agent) => !auth.can("read", agent) && auth.can("list", agent))
      .map((agent) => agent.versionAuthorId)
  );
  const authors =
    authorModelIds.length > 0
      ? await UserResource.fetchByModelIds(authorModelIds)
      : [];
  const authorEmailByModelId = new Map(
    authors.map((author) => [author.id, author.email])
  );

  const labels = new Map<string, AnalyticsAgentLabel>();
  for (const agent of agents) {
    const authorEmail = agent.versionAuthorId
      ? authorEmailByModelId.get(agent.versionAuthorId)
      : null;
    labels.set(agent.sId, {
      name: agent.name,
      pictureUrl: agent.pictureUrl,
      modelId: agent.modelConfiguration.modelId,
      modelDisplayName: getAgentModelDisplayName(agent.modelConfiguration),
      description: auth.can("read", agent)
        ? agent.description
        : privateAgentDescription(authorEmail),
      scope: agent.scope,
    });
  }

  return labels;
}
