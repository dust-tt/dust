import type { estypes } from "@elastic/elasticsearch";

import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

export type LatencyPoint = {
  date: string;
  messages: number;
  average: number;
};

type ByIntervalBucket = {
  key: number;
  doc_count: number;
  avg_latency_ms?: estypes.AggregationsCardinalityAggregate;
};

type LatencyAggs = {
  by_interval?: estypes.AggregationsMultiBucketAggregateBase<ByIntervalBucket>;
};

export async function fetchLatency(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<LatencyPoint[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_interval: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: "day",
      },
      aggs: {
        avg_latency_ms: {
          avg: { field: "latency_ms" },
        },
      },
    },
  };

  const result = await searchAnalytics<never, LatencyAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<ByIntervalBucket>(
    result.value.aggregations?.by_interval?.buckets
  );

  const points: LatencyPoint[] = buckets
    .filter((b) => b.doc_count > 0)
    .map((b) => {
      const date = formatUTCDateFromMillis(b.key);
      return {
        date,
        messages: b.doc_count ?? DEFAULT_METRIC_VALUE,
        average: (b.avg_latency_ms?.value ?? DEFAULT_METRIC_VALUE) / 1000,
      };
    });

  return new Ok(points);
}
