import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

const DEFAULT_SELECTED_METRICS = [
  "conversations",
  "activeUsers",
  "costCents",
] as const satisfies readonly (keyof UsageMetricsPoint)[];

type BaseMetricsPoint = {
  timestamp: number;
  count: number;
};

type Metrics = {
  conversations: number;
  activeUsers: number;
  costCents: number;
};

export type UsageMetricsPoint = BaseMetricsPoint & Metrics;

type ByIntervalBucket = {
  key: number;
  doc_count: number;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  active_users?: estypes.AggregationsCardinalityAggregate;
  cost_cents?: estypes.AggregationsSumAggregate;
};

type UsageMetricsAggs = {
  by_interval?: estypes.AggregationsMultiBucketAggregateBase<ByIntervalBucket>;
};

export type UsageMetricsInterval = "day" | "week";

export async function fetchMessageMetrics<K extends readonly (keyof Metrics)[]>(
  baseQuery: estypes.QueryDslQueryContainer,
  interval: UsageMetricsInterval,
  selectedMetrics?: K
): Promise<Result<(BaseMetricsPoint & Pick<Metrics, K[number]>)[], Error>> {
  const metrics = (selectedMetrics ??
    DEFAULT_SELECTED_METRICS) as readonly (keyof UsageMetricsPoint)[];
  const aggregates: Record<string, estypes.AggregationsAggregationContainer> =
    {};

  if (metrics.includes("conversations")) {
    aggregates.unique_conversations = {
      cardinality: { field: "conversation_id" },
    };
  }

  if (metrics.includes("activeUsers")) {
    aggregates.active_users = { cardinality: { field: "user_id" } };
  }

  if (metrics.includes("costCents")) {
    aggregates.cost_cents = { sum: { field: "tokens.cost_cents" } };
  }

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_interval: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: interval,
      },
      aggs: aggregates,
    },
  };

  const result = await searchAnalytics<never, UsageMetricsAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<ByIntervalBucket>(
    result.value.aggregations?.by_interval?.buckets
  );

  const points: (BaseMetricsPoint & Pick<Metrics, K[number]>)[] = buckets.map(
    (b) => {
      const point: Partial<UsageMetricsPoint> = {
        timestamp: b.key,
        count: b.doc_count ?? DEFAULT_METRIC_VALUE,
      };

      if (metrics.includes("conversations")) {
        point.conversations = Math.round(
          b.unique_conversations?.value ?? DEFAULT_METRIC_VALUE
        );
      }

      if (metrics.includes("activeUsers")) {
        point.activeUsers = Math.round(
          b.active_users?.value ?? DEFAULT_METRIC_VALUE
        );
      }

      if (metrics.includes("costCents")) {
        point.costCents = Math.round(
          b.cost_cents?.value ?? DEFAULT_METRIC_VALUE
        );
      }

      return point as BaseMetricsPoint & Pick<Metrics, K[number]>;
    }
  );

  return new Ok(points);
}
