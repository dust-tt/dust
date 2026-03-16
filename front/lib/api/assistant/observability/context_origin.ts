import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type ContextOriginBucket = {
  origin: string;
  count: number;
};

type ContextOriginAggs = {
  by_origin?: estypes.AggregationsMultiBucketAggregateBase<{
    key: string;
    doc_count: number;
  }>;
};

export async function fetchContextOriginBreakdown(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ContextOriginBucket[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_origin: {
      terms: {
        field: "context_origin",
        size: 20,
        missing: "unknown",
      },
    },
  };

  const result = await searchAnalytics<never, ContextOriginAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<{
    key: string;
    doc_count: number;
  }>(result.value.aggregations?.by_origin?.buckets);

  const mapped: ContextOriginBucket[] = buckets.map((b) => ({
    origin: String(b.key),
    count: b.doc_count ?? 0,
  }));

  return new Ok(mapped);
}

export type ContextOriginDailyPoint = {
  date: string;
  origin: string;
  messageCount: number;
};

type OriginSubBucket = {
  key: string;
  doc_count: number;
};

type DailyOriginDateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  by_origin: estypes.AggregationsMultiBucketAggregateBase<OriginSubBucket>;
};

type DailyOriginAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<DailyOriginDateBucket>;
};

export async function fetchContextOriginDailyBreakdown(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<ContextOriginDailyPoint[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_date: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: "day",
        time_zone: "UTC",
      },
      aggs: {
        by_origin: {
          terms: {
            field: "context_origin",
            size: 20,
            missing: "unknown",
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, DailyOriginAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const dateBuckets = bucketsToArray<DailyOriginDateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  const points: ContextOriginDailyPoint[] = [];

  for (const dateBucket of dateBuckets) {
    const date = formatUTCDateFromMillis(dateBucket.key);
    const originBuckets = bucketsToArray<OriginSubBucket>(
      dateBucket.by_origin?.buckets
    );

    for (const originBucket of originBuckets) {
      points.push({
        date,
        origin: String(originBucket.key),
        messageCount: originBucket.doc_count ?? 0,
      });
    }
  }

  return new Ok(points);
}
