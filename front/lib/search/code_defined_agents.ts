import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import {
  getResourceMatchScore,
  getSearchRankingScore,
} from "@app/lib/search/ranking";
import type { ResourceSearchEntry } from "@app/lib/search/resource_candidates";
import { readCodeDefinedActiveUsers } from "@app/lib/search/usage";
import type { ResourceSearchOptions } from "@app/types/search";
import { removeNulls } from "@app/types/shared/utils/general";

export async function listCodeDefinedSearchAgents(
  auth: Authenticator,
  { searchTerm, mode = "autocomplete", filters = {} }: ResourceSearchOptions
): Promise<Extract<ResourceSearchEntry, { type: "agent" }>[]> {
  const agents = await AgentResource.listGlobalAgentsForSearch(auth, filters);
  if (agents.length === 0) {
    return [];
  }
  const [usage, feedbacks] = await Promise.all([
    mode === "autocomplete"
      ? Promise.resolve<Record<string, number>>({})
      : readCodeDefinedActiveUsers({
          workspaceId: auth.getNonNullableWorkspace().sId,
          resourceType: "agent",
        }),
    mode === "discovery"
      ? AgentMessageFeedbackResource.countByAgentIds(
          auth,
          agents.map((agent) => agent.sId)
        )
      : Promise.resolve(new Map<string, number>()),
  ]);
  return removeNulls(
    agents.map((resource) => {
      const score = getSearchRankingScore({
        mode,
        activeUsers: usage[resource.sId] ?? 0,
        feedbacks: feedbacks.get(resource.sId) ?? 0,
        matchScore: getResourceMatchScore({
          searchTerm,
          mode,
          name: resource.name,
          description: resource.description,
        }),
      });
      return score > 0 ? { type: "agent" as const, resource, score } : null;
    })
  );
}
