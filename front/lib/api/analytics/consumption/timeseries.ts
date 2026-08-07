import { resolveConsumptionGroupNames } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionMetric,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONSUMPTION_METRIC_DEFINITIONS,
  DEFAULT_CONSUMPTION_METRIC,
} from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionBreakdownDimension,
  ConsumptionGranularity,
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesMode,
  ConsumptionTimeseriesPoint,
} from "@app/lib/api/analytics/consumption/series";
import {
  DEFAULT_CONSUMPTION_BREAKDOWN_COUNT,
  OTHERS_GROUP_KEY,
  TOTAL_GROUP_KEY,
} from "@app/lib/api/analytics/consumption/series";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Consumption bucketed over the period, behind the dashboard's consumption
 * chart. Filtered by any of the scope dimensions, optionally split along one of
 * them, aggregating whichever metric was asked for (gross credits by default).
 *
 * Points cover the whole period, including the part of it still to come when
 * the period is a billing cycle. Bucketing stays here rather than moving to the
 * chart because the boundaries are Elasticsearch's calendar rules — weeks start
 * on Monday, months in UTC, the trailing bucket is kept whole — and a second
 * implementation of those rules in the browser would drift from this one
 * silently, one bar at a time.
 *
 * Buckets that have not started yet are zero in every mode. Empty is what they
 * are in `daily`; in `cumulative` it is a deliberate break from the running
 * total, which would otherwise plateau to the end of the cycle and read as
 * consumption having stopped rather than as not having happened.
 */

// Re-exported so server-side callers have one import for the whole timeseries
// contract. Clients must import these from `series.ts` directly — see the note
// there on why values cannot cross into the browser bundle from this file.
export type {
  ConsumptionBreakdownDimension,
  ConsumptionGranularity,
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesMode,
  ConsumptionTimeseriesPoint,
};

export type ConsumptionTimeseries = {
  // Echoed so the chart can label its axis against the window it covers without
  // a second request.
  period: ConsumptionPeriod;
  granularity: ConsumptionGranularity;
  mode: ConsumptionTimeseriesMode;
  metric: ConsumptionMetric;
  breakdownBy: ConsumptionBreakdownDimension | null;
  // In rank order, highest consumption first, with "others" last when present.
  groups: ConsumptionTimeseriesGroup[];
  points: ConsumptionTimeseriesPoint[];
};

export type GetConsumptionTimeseriesResponse = ConsumptionTimeseries;

type GroupBucket = {
  key: string;
  metric?: estypes.AggregationsSumAggregate;
};

type DateBucket = {
  key: number;
  metric?: estypes.AggregationsSumAggregate;
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

type TimeseriesAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<DateBucket>;
};

type RankingAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

function metricSubAgg(
  metric: ConsumptionMetric
): Record<string, estypes.AggregationsAggregationContainer> {
  return {
    metric: { sum: { field: CONSUMPTION_METRIC_DEFINITIONS[metric].field } },
  };
}

function metricValue(
  metric: ConsumptionMetric,
  agg: estypes.AggregationsSumAggregate | undefined
): number {
  return (agg?.value ?? 0) / CONSUMPTION_METRIC_DEFINITIONS[metric].divisor;
}

/**
 * Top `limit` group keys by metric over the whole period.
 *
 * Ranked in its own request rather than as a terms sub-agg of the histogram:
 * a per-bucket top N would pick a different set of agents for each bucket, so
 * a series would mean a different agent from one bar to the next.
 */
async function fetchTopGroupKeys(
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
    bucketsToArray<GroupBucket>(
      result.value.aggregations?.by_group?.buckets
    ).map((bucket) => String(bucket.key))
  );
}

export async function fetchConsumptionTimeseries(
  auth: Authenticator,
  {
    period,
    granularity,
    mode,
    metric = DEFAULT_CONSUMPTION_METRIC,
    breakdownBy,
    breakdownCount = DEFAULT_CONSUMPTION_BREAKDOWN_COUNT,
    filter,
  }: {
    period: ConsumptionPeriod;
    granularity: ConsumptionGranularity;
    mode: ConsumptionTimeseriesMode;
    metric?: ConsumptionMetric;
    breakdownBy?: ConsumptionBreakdownDimension | null;
    breakdownCount?: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTimeseries, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const breakdownField = breakdownBy
    ? CONSUMPTION_DIMENSION_FIELDS[breakdownBy]
    : null;

  let topGroupKeys: string[] = [];
  if (breakdownField) {
    const rankingResult = await fetchTopGroupKeys(query, {
      field: breakdownField,
      limit: breakdownCount,
      metric,
    });
    if (rankingResult.isErr()) {
      return rankingResult;
    }
    topGroupKeys = rankingResult.value;
  }

  const result = await searchConsumptionAnalytics<never, TimeseriesAggs>(
    query,
    {
      aggregations: {
        by_date: {
          date_histogram: {
            field: COMPLETED_AT_FIELD,
            calendar_interval: granularity,
            // The period is resolved in UTC, so the buckets have to be too or a
            // day's consumption straddles two buckets.
            time_zone: "UTC",
            min_doc_count: 0,
            extended_bounds: {
              min: new Date(period.startDate).getTime(),
              // The period is half-open, so `endDate` itself belongs to the
              // next bucket and must not open one of its own. `min_doc_count: 0`
              // then fills the rest of the period with empty buckets, which is
              // the point: the axis is the same whatever has happened so far.
              max: new Date(period.endDate).getTime() - 1,
            },
          },
          aggs: {
            // Kept even when broken down: "others" is this total minus the
            // ranked groups, which is what keeps the stack summing to the
            // period total.
            ...metricSubAgg(metric),
            ...(breakdownField && topGroupKeys.length > 0
              ? {
                  by_group: {
                    terms: {
                      field: breakdownField,
                      include: topGroupKeys,
                      size: topGroupKeys.length,
                    },
                    aggs: metricSubAgg(metric),
                  },
                }
              : {}),
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<DateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  // No breakdown asked for, or nothing consumed at all: one total series.
  if (!breakdownBy || topGroupKeys.length === 0) {
    const points: ConsumptionTimeseriesPoint[] = buckets.map((bucket) => ({
      timestamp: bucket.key,
      values: { [TOTAL_GROUP_KEY]: metricValue(metric, bucket.metric) },
    }));
    return new Ok({
      period,
      granularity,
      mode,
      metric,
      breakdownBy: breakdownBy ?? null,
      groups: [{ groupKey: TOTAL_GROUP_KEY, name: "Total" }],
      points: finalizePoints(points, [TOTAL_GROUP_KEY], mode),
    });
  }

  // Per bucket: the ranked groups' values, plus whatever the bucket total has
  // left over for everyone outside the ranking.
  const bucketValues = buckets.map((bucket) => {
    const valuesByKey = new Map(
      bucketsToArray<GroupBucket>(bucket.by_group?.buckets).map(
        (groupBucket) => [
          String(groupBucket.key),
          metricValue(metric, groupBucket.metric),
        ]
      )
    );

    const rankedValues = topGroupKeys.map(
      (groupKey) => valuesByKey.get(groupKey) ?? 0
    );
    const total = metricValue(metric, bucket.metric);
    return {
      rankedValues,
      // Clamped: floating-point sums can leave a sliver behind, and on a
      // multi-valued dimension (a tool call attributed to several skills) the
      // ranked groups legitimately double-count against the bucket total.
      otherValue: Math.max(
        0,
        total - rankedValues.reduce((sum, value) => sum + value, 0)
      ),
    };
  });

  // Only show an "others" series when something actually falls outside the top
  // N — an empty series in the legend of an all-agents-shown chart is noise.
  const hasOthers = bucketValues.some((bucket) => bucket.otherValue > 0);
  const groupKeys = hasOthers
    ? [...topGroupKeys, OTHERS_GROUP_KEY]
    : topGroupKeys;

  const points: ConsumptionTimeseriesPoint[] = buckets.map((bucket, index) => {
    const values: Record<string, number> = {};
    topGroupKeys.forEach((groupKey, groupIndex) => {
      // A group absent from a bucket still gets a 0, so every point carries
      // exactly the keys in `groups` and the stack is never ragged.
      values[groupKey] = bucketValues[index].rankedValues[groupIndex];
    });
    if (hasOthers) {
      values[OTHERS_GROUP_KEY] = bucketValues[index].otherValue;
    }
    return { timestamp: bucket.key, values };
  });

  const names = await resolveConsumptionGroupNames(
    auth,
    breakdownBy,
    topGroupKeys
  );
  const groups: ConsumptionTimeseriesGroup[] = topGroupKeys.map((groupKey) => ({
    groupKey,
    name: names.get(groupKey) ?? groupKey,
  }));
  if (hasOthers) {
    groups.push({ groupKey: OTHERS_GROUP_KEY, name: "Others" });
  }

  return new Ok({
    period,
    granularity,
    mode,
    metric,
    breakdownBy,
    groups,
    points: finalizePoints(points, groupKeys, mode),
  });
}

/**
 * Zeroes the buckets that have not started yet and, in cumulative mode, carries
 * the running total across the ones that have.
 *
 * One pass rather than two because the two rules are the same rule: a bucket
 * that has not started has consumed nothing, so it neither reports a total nor
 * advances one.
 */
function finalizePoints(
  points: ConsumptionTimeseriesPoint[],
  groupKeys: string[],
  mode: ConsumptionTimeseriesMode
): ConsumptionTimeseriesPoint[] {
  const nowMs = Date.now();
  const running = new Map(groupKeys.map((key) => [key, 0]));

  return points.map((point) => {
    if (point.timestamp > nowMs) {
      return {
        ...point,
        values: Object.fromEntries(groupKeys.map((key) => [key, 0])),
      };
    }

    if (mode !== "cumulative") {
      return point;
    }

    const values: Record<string, number> = {};
    for (const key of groupKeys) {
      const next = (running.get(key) ?? 0) + (point.values[key] ?? 0);
      running.set(key, next);
      values[key] = next;
    }
    return { ...point, values };
  });
}
