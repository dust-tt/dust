import type { estypes } from "@elastic/elasticsearch";

import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
