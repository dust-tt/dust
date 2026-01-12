import type { estypes } from "@elastic/elasticsearch";

export function buildAgentAnalyticsBaseQuery({
  workspaceId,
  agentId,
  days,
  version,
  feedbackNestedQuery,
}: {
  workspaceId: string;
  agentId?: string;
  days?: number;
  version?: string;
  feedbackNestedQuery?: estypes.QueryDslQueryContainer;
}): estypes.QueryDslQueryContainer {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    ...(agentId ? [{ term: { agent_id: agentId } }] : []),
  ];

  if (days) {
    filters.push({ range: { timestamp: { gte: `now-${days}d/d` } } });
  }
  if (version) {
    filters.push({ term: { agent_version: version } });
  }
  if (feedbackNestedQuery) {
    filters.push({ nested: { path: "feedbacks", query: feedbackNestedQuery } });
  }

  return {
    bool: {
      filter: filters,
    },
  };
}
