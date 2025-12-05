import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

const DEFAULT_SELECTED_METRICS = [
  "conversations",
  "activeUsers",
  "costMicroUsd",
] as const satisfies readonly (keyof MessageMetricsPoint)[];

type BaseMetricsPoint = {
  timestamp: number;
  count: number;
};

type Metrics = {
  conversations: number;
  activeUsers: number;
  costMicroUsd: number;
  avgLatencyMs: number;
  percentilesLatencyMs: number;
  failedMessages: number;
  errorRate: number;
};

export type MessageMetricsPoint = BaseMetricsPoint & Metrics;

type MetricName = keyof Metrics;

type KeyedTDigestPercentiles = Omit<
  estypes.AggregationsTDigestPercentilesAggregate,
  "values"
> & {
  values: Record<string, number | null>;
};

/**
 * Generic bucket type that can be used for parsing metrics.
 * This allows different aggregation structures to be parsed with the same logic.
 */
export type MetricsBucket = {
  key: number;
  doc_count: number;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  active_users?: estypes.AggregationsCardinalityAggregate;
  cost_micro_usd?: estypes.AggregationsSumAggregate;
  avg_latency_ms?: estypes.AggregationsCardinalityAggregate;
  percentiles_latency_ms?: KeyedTDigestPercentiles;
  failed_messages?: estypes.AggregationsFilterAggregate;
};

type UsageMetricsAggs = {
  by_interval?: estypes.AggregationsMultiBucketAggregateBase<MetricsBucket>;
};

export type UsageMetricsInterval = "day" | "week";

/**
 * Builds Elasticsearch aggregation definitions for the requested metrics.
 * This is extracted so it can be reused in endpoints that need to compose
 * aggregations (e.g., with additional groupBy terms aggregations).
 */
export function buildMetricAggregates<K extends readonly MetricName[]>(
  metrics: K
): Record<string, estypes.AggregationsAggregationContainer> {
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

  if (metrics.includes("costMicroUsd")) {
    aggregates.cost_micro_usd = { sum: { field: "tokens.cost_micro_usd" } };
  }

  if (metrics.includes("avgLatencyMs")) {
    aggregates.avg_latency_ms = { avg: { field: "latency_ms" } };
  }

  if (metrics.includes("percentilesLatencyMs")) {
    aggregates.percentiles_latency_ms = {
      percentiles: { field: "latency_ms", percents: [50], keyed: true },
    };
  }

  if (metrics.includes("failedMessages") || metrics.includes("errorRate")) {
    aggregates.failed_messages = {
      filter: {
        term: { status: "failed" },
      },
    };
  }

  return aggregates;
}

/**
 * Parses metric values from an Elasticsearch bucket.
 * This is extracted so parsing logic can be reused across different aggregation structures.
 * Accepts any bucket type that has the expected aggregation fields.
 */
export function parseMetricsFromBucket<K extends readonly MetricName[]>(
  bucket: MetricsBucket,
  metrics: K
): BaseMetricsPoint & Pick<Metrics, K[number]> {
  const point: Partial<MessageMetricsPoint> = {
    timestamp: bucket.key,
    count: bucket.doc_count ?? DEFAULT_METRIC_VALUE,
  };

  if (metrics.includes("conversations")) {
    point.conversations = Math.round(
      bucket.unique_conversations?.value ?? DEFAULT_METRIC_VALUE
    );
  }

  if (metrics.includes("activeUsers")) {
    point.activeUsers = Math.round(
      bucket.active_users?.value ?? DEFAULT_METRIC_VALUE
    );
  }

  if (metrics.includes("costMicroUsd")) {
    point.costMicroUsd = Math.round(
      bucket.cost_micro_usd?.value ?? DEFAULT_METRIC_VALUE
    );
  }

  if (metrics.includes("avgLatencyMs")) {
    point.avgLatencyMs = Number(
      ((bucket.avg_latency_ms?.value ?? DEFAULT_METRIC_VALUE) / 1000).toFixed(2)
    );
  }

  if (metrics.includes("percentilesLatencyMs")) {
    point.percentilesLatencyMs = Number(
      (
        (bucket.percentiles_latency_ms?.values?.["50.0"] ??
          DEFAULT_METRIC_VALUE) / 1000
      ).toFixed(2)
    );
  }

  if (metrics.includes("failedMessages")) {
    point.failedMessages =
      bucket.failed_messages?.doc_count ?? DEFAULT_METRIC_VALUE;
  }

  if (metrics.includes("errorRate")) {
    const failed = bucket.failed_messages?.doc_count ?? DEFAULT_METRIC_VALUE;
    point.errorRate =
      bucket.doc_count > 0
        ? Math.round((failed / bucket.doc_count) * 10000) / 100
        : 0;
  }

  return point as BaseMetricsPoint & Pick<Metrics, K[number]>;
}

export async function fetchMessageMetrics<K extends readonly (keyof Metrics)[]>(
  baseQuery: estypes.QueryDslQueryContainer,
  interval: UsageMetricsInterval,
  selectedMetrics?: K
): Promise<Result<(BaseMetricsPoint & Pick<Metrics, K[number]>)[], Error>> {
  const metrics = (selectedMetrics ??
    DEFAULT_SELECTED_METRICS) as readonly MetricName[];

  // Build aggregates using the extracted helper
  const aggregates = buildMetricAggregates(metrics);

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

  const buckets = bucketsToArray<MetricsBucket>(
    result.value.aggregations?.by_interval?.buckets
  );

  // Parse results using the extracted helper
  const points: (BaseMetricsPoint & Pick<Metrics, K[number]>)[] = buckets.map(
    (b) => parseMetricsFromBucket(b, metrics)
  );

  return new Ok(points);
}
