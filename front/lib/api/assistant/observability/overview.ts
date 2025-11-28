import type { estypes } from "@elastic/elasticsearch";

import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type AgentOverview = {
  activeUsers: number;
  conversationCount: number;
  messageCount: number;
  positiveFeedbacks: number;
  negativeFeedbacks: number;
};

type OverviewAggs = {
  active_users?: { value?: number };
  conversations?: { value?: number };
  total_messages?: { value?: number };
  feedbacks?: {
    recent?: {
      doc_count: number;
      up?: { doc_count: number };
      down?: { doc_count: number };
    };
  };
};

export async function fetchAgentOverview(
  baseQuery: estypes.QueryDslQueryContainer,
  days: number
): Promise<Result<AgentOverview, Error>> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      active_users: { cardinality: { field: "user_id" } },
      conversations: { cardinality: { field: "conversation_id" } },
      total_messages: { value_count: { field: "message_id" } },
      feedbacks: {
        nested: { path: "feedbacks" },
        aggs: {
          recent: {
            filter: {
              range: { "feedbacks.created_at": { gte: `now-${days}d/d` } },
            },
            aggs: {
              up: { filter: { term: { "feedbacks.thumb_direction": "up" } } },
              down: {
                filter: { term: { "feedbacks.thumb_direction": "down" } },
              },
            },
          },
        },
      },
    };

  const result = await searchAnalytics<never, OverviewAggs>(baseQuery, {
    aggregations,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const aggs = result.value.aggregations;

  return new Ok({
    activeUsers: Math.round(aggs?.active_users?.value ?? 0),
    conversationCount: Math.round(aggs?.conversations?.value ?? 0),
    messageCount: Math.round(aggs?.total_messages?.value ?? 0),
    positiveFeedbacks: Math.round(aggs?.feedbacks?.recent?.up?.doc_count ?? 0),
    negativeFeedbacks: Math.round(
      aggs?.feedbacks?.recent?.down?.doc_count ?? 0
    ),
  });
}
