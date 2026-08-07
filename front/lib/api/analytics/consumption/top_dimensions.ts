import type {
  ConsumptionGroupBucket,
  ConsumptionMetric,
} from "@app/lib/api/analytics/consumption/scope";
import { metricSubAgg } from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type RankingAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<ConsumptionGroupBucket>;
};

/**
 * Top `limit` keys of a dimension by metric over the whole period.
 */
export async function fetchTopDimensions(
  query: estypes.QueryDslQueryContainer,
  {
    field,
    limit,
    metric,
  }: { field: string; limit: number; metric: ConsumptionMetric }
): Promise<Result<string[], ElasticsearchError>> {
  const result = await searchConsumptionAnalytics<never, RankingAggs>(query, {
    aggregations: {
      by_group: {
        terms: { field, size: limit, order: { metric: "desc" } },
        aggs: metricSubAgg(metric),
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  return new Ok(
    bucketsToArray<ConsumptionGroupBucket>(
      result.value.aggregations?.by_group?.buckets
    ).map((bucket) => String(bucket.key))
  );
}
