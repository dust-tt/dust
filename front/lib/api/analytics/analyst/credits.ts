import type { AnalystScope } from "@app/lib/api/analytics/analyst/scope";
import { analystQuery } from "@app/lib/api/analytics/analyst/scope";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionGroupBucket } from "@app/lib/api/analytics/consumption/scope";
import {
  CONSUMPTION_DIMENSION_FIELDS,
  DEFAULT_CONSUMPTION_METRIC,
  metricSubAgg,
  metricValue,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { ConsumptionScopeDimension } from "@app/types/api/analytics/consumption";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { WithAuth } from "@app/types/shared/typescipt_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

export type AnalystCreditGroupBy = "agent" | "user" | "model" | "none";

export type AnalystCreditRow = {
  groupKey: string;
  name: string;
  totalCredits: number;
};

export type AnalystCreditUsage = {
  totalCredits: number;
  rows: AnalystCreditRow[];
};

function dimensionForGroupBy(
  groupBy: AnalystCreditGroupBy
): ConsumptionScopeDimension | null {
  switch (groupBy) {
    case "agent":
    case "user":
    case "model":
      return groupBy;
    case "none":
      return null;
    default:
      return assertNever(groupBy);
  }
}

type ByGroupAgg = estypes.AggregationsSingleBucketAggregateBase & {
  ranked?: estypes.AggregationsMultiBucketAggregateBase<ConsumptionGroupBucket>;
};

type CreditUsageAggs = {
  metric?: estypes.AggregationsSumAggregate;
  by_group?: ByGroupAgg;
};

export interface FetchAnalystCreditUsageParams {
  scope: AnalystScope;
  groupBy: AnalystCreditGroupBy;
  limit: number;
}

// Ranks by credits within a `filter` sub-agg rather than filtering the root
// query, so `totalCredits` always reflects the whole period.
export async function fetchAnalystCreditUsage({
  auth,
  scope,
  groupBy,
  limit,
}: WithAuth<FetchAnalystCreditUsageParams>): Promise<
  Result<AnalystCreditUsage, ElasticsearchError>
> {
  const dimension = dimensionForGroupBy(groupBy);
  const metricAgg = metricSubAgg(DEFAULT_CONSUMPTION_METRIC);
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    metricAgg;

  if (dimension) {
    const dimensionField = CONSUMPTION_DIMENSION_FIELDS[dimension];
    aggregations.by_group = {
      filter: { exists: { field: dimensionField } },
      aggs: {
        ranked: {
          terms: {
            field: dimensionField,
            size: limit,
            order: { metric: "desc" },
          },
          aggs: metricAgg,
        },
      },
    };
  }

  const result = await searchConsumptionAnalytics<never, CreditUsageAggs>(
    analystQuery({ auth, scope }),
    { aggregations, size: 0 }
  );

  if (result.isErr()) {
    return result;
  }

  const totalCredits = Math.round(
    metricValue(DEFAULT_CONSUMPTION_METRIC, result.value.aggregations?.metric)
  );

  if (!dimension) {
    return new Ok({ totalCredits, rows: [] });
  }

  const buckets = bucketsToArray<ConsumptionGroupBucket>(
    result.value.aggregations?.by_group?.ranked?.buckets
  );
  const keys = buckets.map((bucket) => String(bucket.key));
  const labels = await resolveDimensionLabels(auth, dimension, keys);

  const rows = buckets.map((bucket) => {
    const key = String(bucket.key);
    return {
      groupKey: key,
      name: labels.get(key)?.name ?? key,
      totalCredits: Math.round(
        metricValue(DEFAULT_CONSUMPTION_METRIC, bucket.metric)
      ),
    };
  });

  return new Ok({ totalCredits, rows });
}
