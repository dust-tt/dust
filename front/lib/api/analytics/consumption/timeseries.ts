import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CREDIT_MICRO_FIELD,
  creditsFromMicroCredits,
} from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionBreakdownDimension,
  ConsumptionGranularity,
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesMode,
  ConsumptionTimeseriesPoint,
} from "@app/lib/api/analytics/consumption/series";
import {
  OTHERS_GROUP_KEY,
  TOTAL_GROUP_KEY,
} from "@app/lib/api/analytics/consumption/series";
import {
  resolveAnalyticsAgentLabels,
  UNKNOWN_AGENT_LABEL,
} from "@app/lib/api/assistant/observability/agent_labels";
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
 * Credit consumption bucketed over the period, behind the dashboard's
 * consumption chart.
 *
 * Two things this does that the agent-message timeseries does not:
 *
 * - Buckets run to the end of the cycle, not to now. Empty future buckets are
 *   emitted so the chart's x axis covers the whole cycle from day one instead
 *   of growing as the cycle progresses.
 * - The bucket the present moment falls into is flagged partial. Its total is
 *   still growing, and without the flag the chart's last bar reads as a drop in
 *   consumption rather than as a day in progress.
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
  // Echoed so the chart can label its axis against the cycle it covers without
  // a second request.
  period: ConsumptionPeriod;
  granularity: ConsumptionGranularity;
  mode: ConsumptionTimeseriesMode;
  breakdownBy: ConsumptionBreakdownDimension | null;
  // In rank order, highest consumption first, with "others" last when present.
  groups: ConsumptionTimeseriesGroup[];
  points: ConsumptionTimeseriesPoint[];
};

export type GetConsumptionTimeseriesResponse = ConsumptionTimeseries;

type GroupBucket = {
  key: string;
  credit_micro?: estypes.AggregationsSumAggregate;
};

type DateBucket = {
  key: number;
  credit_micro?: estypes.AggregationsSumAggregate;
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

type TimeseriesAggs = {
  by_date?: estypes.AggregationsMultiBucketAggregateBase<DateBucket>;
};

type RankingAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
};

const CREDIT_MICRO_SUB_AGG = {
  credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
} as const;

// Index of the bucket the present moment falls into, or -1 when the period is
// already over (every bucket is then complete).
function findPartialBucketIndex(
  buckets: DateBucket[],
  period: ConsumptionPeriod
): number {
  const nowMs = Date.now();
  if (nowMs >= new Date(period.cycleEndDate).getTime()) {
    return -1;
  }
  let partialIndex = -1;
  for (const [index, bucket] of buckets.entries()) {
    if (bucket.key <= nowMs) {
      partialIndex = index;
    }
  }
  return partialIndex;
}

function accumulate(
  points: ConsumptionTimeseriesPoint[],
  groupKeys: string[]
): ConsumptionTimeseriesPoint[] {
  const running = new Map(groupKeys.map((key) => [key, 0]));
  return points.map((point) => {
    const values: Record<string, number> = {};
    for (const key of groupKeys) {
      const next = (running.get(key) ?? 0) + (point.values[key] ?? 0);
      running.set(key, next);
      values[key] = next;
    }
    return { ...point, values };
  });
}

/**
 * Top `limit` group keys by consumption over the whole period.
 *
 * Ranked in its own request rather than as a terms sub-agg of the histogram:
 * a per-bucket top N would pick a different set of agents for each bucket, so
 * a series would mean a different agent from one bar to the next.
 */
async function fetchTopGroupKeys(
  query: estypes.QueryDslQueryContainer,
  { field, limit }: { field: string; limit: number }
): Promise<Result<string[], ElasticsearchError>> {
  const result = await searchConsumptionAnalytics<never, RankingAggs>(query, {
    aggregations: {
      by_group: {
        terms: { field, size: limit, order: { credit_micro: "desc" } },
        aggs: { ...CREDIT_MICRO_SUB_AGG },
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

async function resolveGroupNames(
  auth: Authenticator,
  breakdownBy: ConsumptionBreakdownDimension,
  groupKeys: string[]
): Promise<Map<string, string>> {
  // Only `agent` for now; the enum is a single value, so no dispatch needed
  // beyond this. Extend alongside CONSUMPTION_BREAKDOWN_DIMENSIONS.
  const labels = await resolveAnalyticsAgentLabels(auth, groupKeys);
  return new Map(
    groupKeys.map((key) => [key, (labels.get(key) ?? UNKNOWN_AGENT_LABEL).name])
  );
}

export async function fetchConsumptionTimeseries(
  auth: Authenticator,
  {
    period,
    granularity,
    mode,
    breakdownBy,
    breakdownCount,
    filter,
  }: {
    period: ConsumptionPeriod;
    granularity: ConsumptionGranularity;
    mode: ConsumptionTimeseriesMode;
    breakdownBy?: ConsumptionBreakdownDimension | null;
    breakdownCount?: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTimeseries, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const breakdownField = breakdownBy
    ? CONSUMPTION_DIMENSION_FIELDS[breakdownBy]
    : null;

  let topGroupKeys: string[] = [];
  if (breakdownBy && breakdownField) {
    const rankingResult = await fetchTopGroupKeys(query, {
      field: breakdownField,
      limit: breakdownCount ?? 10,
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
              min: new Date(period.cycleStartDate).getTime(),
              // Deliberately the end of the cycle rather than the end of the
              // queried window: this is what produces the empty future buckets.
              max: new Date(period.cycleEndDate).getTime(),
            },
          },
          aggs: {
            // Kept even when broken down: "others" is this total minus the ranked
            // groups, which is what keeps the stack summing to the period total.
            ...CREDIT_MICRO_SUB_AGG,
            ...(breakdownField && topGroupKeys.length > 0
              ? {
                  by_group: {
                    terms: {
                      field: breakdownField,
                      include: topGroupKeys,
                      size: topGroupKeys.length,
                    },
                    aggs: { ...CREDIT_MICRO_SUB_AGG },
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
  const partialIndex = findPartialBucketIndex(buckets, period);

  // No breakdown asked for, or nothing consumed at all: one total series.
  if (!breakdownBy || topGroupKeys.length === 0) {
    const points: ConsumptionTimeseriesPoint[] = buckets.map(
      (bucket, index) => ({
        timestamp: bucket.key,
        values: {
          [TOTAL_GROUP_KEY]: creditsFromMicroCredits(
            bucket.credit_micro?.value ?? 0
          ),
        },
        isPartial: index === partialIndex,
      })
    );
    return new Ok({
      period,
      granularity,
      mode,
      breakdownBy: breakdownBy ?? null,
      groups: [{ groupKey: TOTAL_GROUP_KEY, name: "Total" }],
      points: finalizePoints(points, [TOTAL_GROUP_KEY], mode, partialIndex),
    });
  }

  // Per bucket: the ranked groups' credits, plus whatever the bucket total has
  // left over for everyone outside the ranking.
  const bucketCredits = buckets.map((bucket) => {
    const creditsByKey = new Map(
      bucketsToArray<GroupBucket>(bucket.by_group?.buckets).map(
        (groupBucket) => [
          String(groupBucket.key),
          creditsFromMicroCredits(groupBucket.credit_micro?.value ?? 0),
        ]
      )
    );

    const rankedCredits = topGroupKeys.map(
      (groupKey) => creditsByKey.get(groupKey) ?? 0
    );
    const total = creditsFromMicroCredits(bucket.credit_micro?.value ?? 0);
    return {
      rankedCredits,
      // Floating-point sums can leave a sliver behind; clamp so "others" never
      // goes negative.
      otherCredits: Math.max(
        0,
        total - rankedCredits.reduce((sum, credits) => sum + credits, 0)
      ),
    };
  });

  // Only show an "others" series when something actually falls outside the top
  // N — an empty series in the legend of an all-agents-shown chart is noise.
  const hasOthers = bucketCredits.some((bucket) => bucket.otherCredits > 0);
  const groupKeys = hasOthers
    ? [...topGroupKeys, OTHERS_GROUP_KEY]
    : topGroupKeys;

  const points: ConsumptionTimeseriesPoint[] = buckets.map((bucket, index) => {
    const values: Record<string, number> = {};
    topGroupKeys.forEach((groupKey, groupIndex) => {
      // A group absent from a bucket still gets a 0, so every point carries
      // exactly the keys in `groups` and the stack is never ragged.
      values[groupKey] = bucketCredits[index].rankedCredits[groupIndex];
    });
    if (hasOthers) {
      values[OTHERS_GROUP_KEY] = bucketCredits[index].otherCredits;
    }
    return { timestamp: bucket.key, values, isPartial: index === partialIndex };
  });

  const names = await resolveGroupNames(auth, breakdownBy, topGroupKeys);
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
    breakdownBy,
    groups,
    points: finalizePoints(points, groupKeys, mode, partialIndex),
  });
}

// A cumulative series stops at the bucket in progress: carrying the running
// total across buckets that have not happened yet would draw a plateau that
// reads as consumption having stopped.
function finalizePoints(
  points: ConsumptionTimeseriesPoint[],
  groupKeys: string[],
  mode: ConsumptionTimeseriesMode,
  partialIndex: number
): ConsumptionTimeseriesPoint[] {
  if (mode !== "cumulative") {
    return points;
  }
  return accumulate(
    partialIndex === -1 ? points : points.slice(0, partialIndex + 1),
    groupKeys
  );
}
