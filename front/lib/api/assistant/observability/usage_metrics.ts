import type { estypes } from "@elastic/elasticsearch";

import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

export type UsageMetricsPoint = {
  date: string;
  messages: number;
  conversations: number;
  activeUsers: number;
};

type ByIntervalBucket = {
  key: number;
  doc_count: number;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  active_users?: estypes.AggregationsCardinalityAggregate;
};

type UsageMetricsAggs = {
  by_interval?: estypes.AggregationsMultiBucketAggregateBase<ByIntervalBucket>;
};

export type UsageMetricsInterval = "day" | "week";

export async function fetchUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  interval: UsageMetricsInterval
): Promise<Result<UsageMetricsPoint[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_interval: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: interval,
      },
      aggs: {
        unique_conversations: {
          cardinality: { field: "conversation_id" },
        },
        active_users: { cardinality: { field: "user_id" } },
      },
    },
  };

  const result = await searchAnalytics<unknown, UsageMetricsAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<ByIntervalBucket>(
    result.value.aggregations?.by_interval?.buckets
  );

  const points: UsageMetricsPoint[] = buckets.map((b) => {
    const date = formatUTCDateFromMillis(b.key);
    return {
      date,
      messages: b.doc_count ?? DEFAULT_METRIC_VALUE,
      conversations: Math.round(
        b.unique_conversations?.value ?? DEFAULT_METRIC_VALUE
      ),
      activeUsers: Math.round(b.active_users?.value ?? DEFAULT_METRIC_VALUE),
    };
  });

  return new Ok(points);
}
