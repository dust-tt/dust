import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_METRIC_VALUE = 0;

export type ErrorRatePoint = {
  timestamp: number;
  total: number;
  failed: number;
  errorRate: number;
};

type ByIntervalBucket = {
  key: number;
  doc_count: number;
  failed_messages?: estypes.AggregationsFilterAggregate;
};

type ErrorRateAggs = {
  by_interval?: estypes.AggregationsMultiBucketAggregateBase<ByIntervalBucket>;
};

export async function fetchErrorRate(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ErrorRatePoint[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_interval: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: "day",
      },
      aggs: {
        failed_messages: {
          filter: {
            term: { status: "failed" },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, ErrorRateAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<ByIntervalBucket>(
    result.value.aggregations?.by_interval?.buckets
  );

  const points: ErrorRatePoint[] = buckets
    .filter((b) => b.doc_count > 0)
    .map((b) => {
      const total = b.doc_count ?? DEFAULT_METRIC_VALUE;
      const failed = b.failed_messages?.doc_count ?? DEFAULT_METRIC_VALUE;
      const errorRate =
        total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;

      return {
        timestamp: b.key,
        total,
        failed,
        errorRate,
      };
    });

  return new Ok(points);
}
