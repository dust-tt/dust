import type { estypes } from "@elastic/elasticsearch";

export function buildAgentAnalyticsBaseQuery({
  workspaceId,
  agentId,
  days,
  feedbackNestedQuery,
}: {
  workspaceId: string;
  agentId: string;
  days?: number;
  feedbackNestedQuery?: estypes.QueryDslQueryContainer;
}): estypes.QueryDslQueryContainer {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    { term: { agent_id: agentId } },
  ];

  if (days) {
    filters.push({ range: { timestamp: { gte: `now-${days}d/d` } } });
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

export function buildFeedbackQuery({
  dismissed,
}: {
  dismissed: boolean;
}): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [{ term: { "feedbacks.dismissed": dismissed } }],
    },
  };
}
