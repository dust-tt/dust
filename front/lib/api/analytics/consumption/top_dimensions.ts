import type {
  ConsumptionGroupBucket,
  ConsumptionMetric,
  ConsumptionScopeDimension,
} from "@app/lib/api/analytics/consumption/scope";
import {
  CONSUMPTION_DIMENSION_FIELDS,
  metricSubAgg,
  metricValue,
} from "@app/lib/api/analytics/consumption/scope";
import {
  canonicalSourceForOrigin,
  PROGRAMMATIC_SOURCE_ORIGIN_COUNT,
} from "@app/lib/api/analytics/source_labels";
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
 * Top `limit` canonical values of a dimension by metric over the whole period.
 */
export async function fetchTopDimensions(
  query: estypes.QueryDslQueryContainer,
  {
    dimension,
    limit,
    metric,
  }: {
    dimension: ConsumptionScopeDimension;
    limit: number;
    metric: ConsumptionMetric;
  }
): Promise<Result<string[], ElasticsearchError>> {
  const result = await searchConsumptionAnalytics<never, RankingAggs>(query, {
    aggregations: {
      by_group: {
        terms: {
          field: CONSUMPTION_DIMENSION_FIELDS[dimension],
          size:
            limit +
            (dimension === "source" ? PROGRAMMATIC_SOURCE_ORIGIN_COUNT : 0),
          order: { metric: "desc" },
        },
        aggs: metricSubAgg(metric),
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const metricByValue = new Map<string, number>();
  for (const bucket of bucketsToArray<ConsumptionGroupBucket>(
    result.value.aggregations?.by_group?.buckets
  )) {
    const rawValue = String(bucket.key);
    const value =
      dimension === "source" ? canonicalSourceForOrigin(rawValue) : rawValue;
    metricByValue.set(
      value,
      (metricByValue.get(value) ?? 0) + metricValue(metric, bucket.metric)
    );
  }

  return new Ok(
    [...metricByValue]
      .sort(([, left], [, right]) => right - left)
      .slice(0, limit)
      .map(([value]) => value)
  );
}
