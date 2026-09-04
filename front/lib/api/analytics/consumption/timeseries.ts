import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { DEFAULT_CONSUMPTION_BREAKDOWN_COUNT } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionGroupBucket,
  ConsumptionMetric,
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  DEFAULT_CONSUMPTION_METRIC,
  metricSubAgg,
  metricValue,
} from "@app/lib/api/analytics/consumption/scope";
import { fetchTopDimensions } from "@app/lib/api/analytics/consumption/top_dimensions";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { resolveDimensionDisplayNames } from "./labels";

export { DEFAULT_CONSUMPTION_BREAKDOWN_COUNT } from "@app/lib/api/analytics/consumption/schema";

export type ConsumptionGranularity = "day" | "week" | "month";
export type ConsumptionTimeseriesMode = "period" | "cumulative";

export const TOTAL_GROUP_KEY = "total";

export const OTHERS_GROUP_KEY = "others";

export type ConsumptionBreakdownDimension = ConsumptionScopeDimension;

export type ConsumptionTimeseriesGroup = {
  groupKey: string;
  name: string;
};

export type ConsumptionTimeseriesPoint = {
  timestamp: number;
  activeUsers: number;
  values: Record<string, number>;
};

export type ConsumptionTimeseries = {
  // Echoed so the chart can label its axis against the window it covers without
  // a second request.
  period: ConsumptionPeriod;
  granularity: ConsumptionGranularity;
  mode: ConsumptionTimeseriesMode;
  metric: ConsumptionMetric;
  timezone: string;
  breakdownBy: ConsumptionBreakdownDimension | null;
  workspaceMemberCount: number;
  // In rank order, highest consumption first, with "others" last when present.
  groups: ConsumptionTimeseriesGroup[];
  points: ConsumptionTimeseriesPoint[];
};

export type GetConsumptionTimeseriesResponse = ConsumptionTimeseries;

type ConsumptionTimeseriesData = Omit<
  ConsumptionTimeseries,
  "workspaceMemberCount"
>;

type ConsumptionTimeseriesScope = {
  period: ConsumptionPeriod;
  granularity: ConsumptionGranularity;
  mode: ConsumptionTimeseriesMode;
  metric: ConsumptionMetric;
  timezone: string;
};

type DateBucket = {
  key: number;
  active_users?: estypes.AggregationsCardinalityAggregate;
  metric?: estypes.AggregationsSumAggregate;
  by_group?: estypes.AggregationsMultiBucketAggregateBase<ConsumptionGroupBucket>;
};

type TimeseriesAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<DateBucket>;
};

type ConsumptionMetricBucket = {
  timestamp: number;
  activeUsers: number;
  total: number;
  // Empty unless the search was given a breakdown, in which case the keys are a
  // subset of the ones it was restricted to.
  valueByGroupKey: Map<string, number>;
};

type ConsumptionBreakdown = {
  field: string;
  groupKeys: string[];
};

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
    timezone = "UTC",
  }: {
    period: ConsumptionPeriod;
    granularity: ConsumptionGranularity;
    mode: ConsumptionTimeseriesMode;
    metric?: ConsumptionMetric;
    breakdownBy?: ConsumptionBreakdownDimension | null;
    breakdownCount?: number;
    filter?: ConsumptionScopeFilter;
    timezone?: string;
  }
): Promise<Result<ConsumptionTimeseries, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth: auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });
  const scope = { period, granularity, mode, metric, timezone };
  let timeseriesResult: Result<ConsumptionTimeseriesData, ElasticsearchError>;
  if (!breakdownBy) {
    timeseriesResult = await fetchTimeseries(query, scope);
  } else {
    timeseriesResult = await fetchTimeseriesBreakdown(auth, query, scope, {
      breakdownBy,
      breakdownCount,
    });
  }

  if (timeseriesResult.isErr()) {
    return timeseriesResult;
  }

  const workspace = auth.getNonNullableWorkspace();
  const workspaceMemberCount =
    await MembershipResource.countActiveMembersForWorkspace({ workspace });

  return new Ok({
    ...timeseriesResult.value,
    workspaceMemberCount,
  });
}

async function fetchTimeseries(
  query: estypes.QueryDslQueryContainer,
  scope: ConsumptionTimeseriesScope,
  breakdownBy: ConsumptionBreakdownDimension | null = null
): Promise<Result<ConsumptionTimeseriesData, ElasticsearchError>> {
  const bucketsResult = await fetchMetricTimeseries(query, {
    period: scope.period,
    granularity: scope.granularity,
    timezone: scope.timezone,
    metric: scope.metric,
    breakdown: null,
  });
  if (bucketsResult.isErr()) {
    return bucketsResult;
  }

  const points = bucketsResult.value.map((bucket) => ({
    timestamp: bucket.timestamp,
    activeUsers: bucket.activeUsers,
    values: { [TOTAL_GROUP_KEY]: bucket.total },
  }));

  return new Ok({
    ...scope,
    breakdownBy,
    groups: [{ groupKey: TOTAL_GROUP_KEY, name: "Total" }],
    points: finalizePoints(points, [TOTAL_GROUP_KEY], scope.mode),
  });
}

async function fetchTimeseriesBreakdown(
  auth: Authenticator,
  query: estypes.QueryDslQueryContainer,
  scope: ConsumptionTimeseriesScope,
  {
    breakdownBy,
    breakdownCount,
  }: {
    breakdownBy: ConsumptionBreakdownDimension;
    breakdownCount: number;
  }
): Promise<Result<ConsumptionTimeseriesData, ElasticsearchError>> {
  const field = CONSUMPTION_DIMENSION_FIELDS[breakdownBy];

  const rankingResult = await fetchTopDimensions(query, {
    field,
    limit: breakdownCount,
    metric: scope.metric,
  });
  if (rankingResult.isErr()) {
    return rankingResult;
  }
  const topDimensionKeys = rankingResult.value;

  if (topDimensionKeys.length === 0) {
    return fetchTimeseries(query, scope);
  }

  const bucketsResult = await fetchMetricTimeseries(query, {
    period: scope.period,
    granularity: scope.granularity,
    timezone: scope.timezone,
    metric: scope.metric,
    breakdown: { field, groupKeys: topDimensionKeys },
  });
  if (bucketsResult.isErr()) {
    return bucketsResult;
  }

  const { points, hasOthers } = buildBreakdownPoints(
    bucketsResult.value,
    topDimensionKeys
  );

  const names = await resolveDimensionDisplayNames(
    auth,
    breakdownBy,
    topDimensionKeys
  );
  const rankedGroups = topDimensionKeys.map((groupKey) => ({
    groupKey,
    name: names.get(groupKey) ?? groupKey,
  }));
  const groups: ConsumptionTimeseriesGroup[] = hasOthers
    ? [...rankedGroups, { groupKey: OTHERS_GROUP_KEY, name: "Others" }]
    : rankedGroups;

  return new Ok({
    ...scope,
    breakdownBy,
    groups,
    points: finalizePoints(
      points,
      groups.map((group) => group.groupKey),
      scope.mode
    ),
  });
}

async function fetchMetricTimeseries(
  query: estypes.QueryDslQueryContainer,
  {
    period,
    granularity,
    timezone,
    metric,
    breakdown,
  }: {
    period: ConsumptionPeriod;
    granularity: ConsumptionGranularity;
    timezone: string;
    metric: ConsumptionMetric;
    breakdown: ConsumptionBreakdown | null;
  }
): Promise<Result<ConsumptionMetricBucket[], ElasticsearchError>> {
  const result = await searchConsumptionAnalytics<never, TimeseriesAggs>(
    query,
    {
      aggregations: {
        by_date: {
          date_histogram: {
            field: COMPLETED_AT_FIELD,
            calendar_interval: granularity,
            time_zone: timezone,
            min_doc_count: 0,
            extended_bounds: {
              min: new Date(period.startDate).getTime(),
              // The period is half-open, so `endDate` itself belongs to the
              // next bucket and must not open one of its own.
              max: new Date(period.endDate).getTime() - 1,
            },
          },
          aggs: {
            active_users: {
              cardinality: {
                field: CONSUMPTION_DIMENSION_FIELDS.user,
                precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
              },
            },
            ...metricSubAgg(metric),
            ...(breakdown
              ? {
                  by_group: {
                    terms: {
                      field: breakdown.field,
                      include: breakdown.groupKeys,
                      size: breakdown.groupKeys.length,
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

  return new Ok(
    buckets.map((bucket) => ({
      timestamp: bucket.key,
      activeUsers: Math.round(bucket.active_users?.value ?? 0),
      total: metricValue(metric, bucket.metric),
      valueByGroupKey: new Map(
        bucketsToArray<ConsumptionGroupBucket>(bucket.by_group?.buckets).map(
          (groupBucket) => [
            String(groupBucket.key),
            metricValue(metric, groupBucket.metric),
          ]
        )
      ),
    }))
  );
}

/**
 * Per bucket: the ranked groups' values, plus whatever the bucket total has left
 * over for everyone outside the ranking.
 */
function buildBreakdownPoints(
  buckets: ConsumptionMetricBucket[],
  groupKeys: string[]
): { points: ConsumptionTimeseriesPoint[]; hasOthers: boolean } {
  const otherValues = buckets.map((bucket) => otherValue(bucket, groupKeys));

  // Only show an "others" series when something actually falls outside the top
  // N — an empty series in the legend of an all-agents-shown chart is noise.
  const hasOthers = otherValues.some((value) => value > 0);

  const points = buckets.map((bucket, index) => {
    const values: Record<string, number> = {};
    for (const groupKey of groupKeys) {
      // A group absent from a bucket still gets a 0, so every point carries
      // exactly the keys in `groups` and the stack is never ragged.
      values[groupKey] = bucket.valueByGroupKey.get(groupKey) ?? 0;
    }
    if (hasOthers) {
      values[OTHERS_GROUP_KEY] = otherValues[index];
    }
    return {
      timestamp: bucket.timestamp,
      activeUsers: bucket.activeUsers,
      values,
    };
  });

  return { points, hasOthers };
}

function otherValue(
  bucket: ConsumptionMetricBucket,
  groupKeys: string[]
): number {
  const ranked = groupKeys.reduce(
    (sum, groupKey) => sum + (bucket.valueByGroupKey.get(groupKey) ?? 0),
    0
  );
  return Math.max(0, bucket.total - ranked);
}

/**
 * Zeroes the buckets that have not started yet and, in cumulative mode, carries
 * the running total across the ones that have.
 *
 * Regardless of mode, a bucket in the future is always zeroed (so the timeseries stops
 * rather than plateau in cumulative mode).
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
        activeUsers: 0,
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
