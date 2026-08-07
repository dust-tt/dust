import {
  getAgentConfigurations,
  getAgentLabelsByIds,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentModelDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";

// A simplified, UI-friendly reading of `AgentConfigurationScope`: "global" agents
// (Dust-provided, unremovable) read as company-wide, "visible" (published) agents
// as shared with the workspace, and "hidden" (unpublished, editors-only) agents as
// private to their editors.
export type AgentVisibilityScope = "company" | "shared" | "private";

function agentVisibilityScope(
  scope: AgentConfigurationScope
): AgentVisibilityScope {
  switch (scope) {
    case "global":
      return "company";
    case "visible":
      return "shared";
    case "hidden":
      return "private";
    default:
      return assertNever(scope);
  }
}

type AnalyticsAgentLabel = {
  name: string;
  pictureUrl: string | null;
  modelDisplayName: string;
  description: string;
  scope: AgentVisibilityScope;
};

const PRIVATE_AGENT_DESCRIPTION = "Private agent: description unavailable";

export const UNKNOWN_AGENT_LABEL: AnalyticsAgentLabel = {
  name: "Unknown agent",
  pictureUrl: null,
  modelDisplayName: getAgentModelDisplayName(undefined),
  description: "",
  // Unresolvable ids (a deleted agent, one from another workspace's stale
  // index entry) are never company-wide by construction, so "private" is the
  // safe default bucket.
  scope: "private",
};

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

  return new Map(
    agentIds.map((agentId) => {
      const agent = agentsById.get(agentId);
      if (agent) {
        return [
          agentId,
          {
            name: agent.name,
            pictureUrl: agent.pictureUrl,
            modelDisplayName: getAgentModelDisplayName(agent.model),
            description: agent.canRead
              ? agent.description
              : PRIVATE_AGENT_DESCRIPTION,
            scope: agentVisibilityScope(agent.scope),
          },
        ];
      }

      const fallback = fallbackById.get(agentId);
      if (fallback) {
        return [
          agentId,
          {
            name: fallback.name,
            pictureUrl: fallback.pictureUrl,
            modelDisplayName: getAgentModelDisplayName(fallback.model),
            description: PRIVATE_AGENT_DESCRIPTION,
            // Only reachable for an agent the caller cannot read via the normal
            // path, i.e. hidden (private) agents belonging to someone else.
            scope: "private",
          },
        ];
      }

      return [agentId, UNKNOWN_AGENT_LABEL];
    })
  );
}
