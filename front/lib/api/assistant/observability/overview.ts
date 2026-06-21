import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type AgentCostStats = {
  totalCostCredits: number | null;
  avgCostCredits: number | null;
  medianCostCredits: number | null;
};

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

const EMPTY_COST_STATS: AgentCostStats = {
  totalCostCredits: null,
  avgCostCredits: null,
  medianCostCredits: null,
};

type KeyedTDigestPercentiles = Omit<
  estypes.AggregationsTDigestPercentilesAggregate,
  "values"
> & {
  values: Record<string, number | null>;
};

type CostAgentBucket = {
  key: string;
  total_cost?: estypes.AggregationsSumAggregate;
  avg_cost?: estypes.AggregationsAvgAggregate;
  median_cost?: KeyedTDigestPercentiles;
};

type AgentCostStatsAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<CostAgentBucket>;
};

export async function fetchAgentCostStats(
  auth: Authenticator,
  {
    agentIds,
    days,
    startDate,
    endDate,
    version,
  }: {
    agentIds: string[];
    days?: number;
    startDate?: string;
    endDate?: string;
    version?: string;
  }
): Promise<Result<Map<string, AgentCostStats>, ElasticsearchError>> {
  if (agentIds.length === 0) {
    return new Ok(new Map());
  }

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    agentIds,
    days,
    startDate,
    endDate,
    version,
  });

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [baseQuery, { range: { "cost.full_awu": { gt: 0 } } }],
    },
  };

  const result = await searchAnalytics<never, AgentCostStatsAggs>(query, {
    aggregations: {
      by_agent: {
        terms: { field: "agent_id", size: agentIds.length },
        aggs: {
          total_cost: { sum: { field: "cost.full_awu" } },
          avg_cost: { avg: { field: "cost.full_awu" } },
          median_cost: {
            percentiles: { field: "cost.full_awu", percents: [50] },
          },
        },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<CostAgentBucket>(
    result.value.aggregations?.by_agent?.buckets
  );

  return new Ok(
    new Map(
      buckets.map((bucket) => [
        String(bucket.key),
        {
          totalCostCredits: bucket.total_cost?.value ?? null,
          avgCostCredits: bucket.avg_cost?.value ?? null,
          medianCostCredits: bucket.median_cost?.values?.["50.0"] ?? null,
        },
      ])
    )
  );
}

export function getAgentCostStats(
  map: Map<string, AgentCostStats>,
  agentId: string
): AgentCostStats {
  return map.get(agentId) ?? EMPTY_COST_STATS;
}

export type GetAgentOverviewResponseBody = {
  activeUsers: number;
  mentions: {
    messageCount: number;
    conversationCount: number;
    timePeriodSec: number;
  };
  feedbacks: {
    positiveFeedbacks: number;
    negativeFeedbacks: number;
    timePeriodSec: number;
  };
  costs: AgentCostStats;
};
