import type { estypes } from "@elastic/elasticsearch";

export function buildAgentAnalyticsBaseQuery(
  workspaceId: string,
  agentId: string,
  days?: number
): estypes.QueryDslQueryContainer {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    { term: { agent_id: agentId } },
  ];

  if (days) {
    filters.push({ range: { timestamp: { gte: `now-${days}d/d` } } });
  }
  return {
    bool: {
      filter: filters,
    },
  };
}
