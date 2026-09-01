import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { AgentCostStats } from "@app/types/api/assistant/observability/overview";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type AgentOverview = {
  activeUsers: number;
  conversationCount: number;
  messageCount: number;
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
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AgentOverview, Error>> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      active_users: { cardinality: { field: "user_id" } },
      conversations: { cardinality: { field: "conversation_id" } },
      total_messages: { value_count: { field: "message_id" } },
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
      filter: [
        baseQuery,
        // Billed cost per execution: `cost.billable_awu` is already 0 for the
        // non-billable (errored terminal) part, so no status filter is needed and
        // failed multi-execution messages still contribute their non-error work.
        // `> 0` keeps this to messages that actually incurred billed cost.
        { range: { "cost.billable_awu": { gt: 0 } } },
      ],
    },
  };

  const result = await searchAnalytics<never, AgentCostStatsAggs>(query, {
    aggregations: {
      by_agent: {
        terms: { field: "agent_id", size: agentIds.length },
        aggs: {
          total_cost: { sum: { field: "cost.billable_awu" } },
          avg_cost: { avg: { field: "cost.billable_awu" } },
          median_cost: {
            percentiles: { field: "cost.billable_awu", percents: [50] },
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
