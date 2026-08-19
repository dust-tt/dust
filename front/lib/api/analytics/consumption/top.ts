import { listConsumptionFacetCatalogDimension } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { previousConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
  ConsumptionTopSortBy,
  ConsumptionTopSortOrder,
  ConsumptionTopUnit,
} from "@app/lib/api/analytics/consumption/scope";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONSUMPTION_DIMENSION_UNIT,
  CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";
import chunk from "lodash/chunk";

type ConsumptionTopGroup = {
  key: string;
  credits: number;
  // Distinct messages, or tool invocations, per the ranking's unit.
  count: number;
  // This key's credits over the equivalent window immediately preceding the
  // period, for period-over-period growth. Null when the key had no
  // consumption at all in that prior window.
  previousCredits: number | null;
};

export type ConsumptionTopGroups = {
  groups: ConsumptionTopGroup[];
  hasMore: boolean;
  // Distinct dimension values over the scoped period.
  totalCount: number;
  // Gross credits over the whole scoped period, every document included. Not the
  // sum of `groups`. The ranking is capped at `limit`, and a dimension that only
  // exists on some documents (a tool, a skill) accounts for part of the total.
  totalCredits: number;
};

// Sub-aggregation names, kept out of the callers so the ranking order and the
// bucket reads below cannot drift apart.
const CREDIT_AGG = "credit_micro";
const MESSAGES_AGG = "messages";
const TOTAL_COUNT_AGG = "total_count";
const CURRENT_PERIOD_AGG = "current_period";
const PREVIOUS_PERIOD_AGG = "previous_period";
const AVG_CREDITS_AGG = "avg_credits";
const GROWTH_AGG = "growth";
const RANKING_TERMS_PAGE_SIZE = 1_000;
const MAX_ES_QUERY_CLAUSES = 1_024;
const MAX_ES_TERMS_QUERY_VALUES = 65_536;

// A key with no prior-period credits has no ratio to rank by. Sink it to
// whichever end of a vs-prev sort the sentinel's magnitude puts it at, rather
// than dropping it from the ranking or crashing the script on a divide by zero.
const NO_PREVIOUS_DATA_GROWTH_SENTINEL = -1_000_000;

type PeriodMetricBucket = estypes.AggregationsFilterAggregate & {
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [MESSAGES_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type GroupBucket = {
  key: string;
  doc_count: number;
  [CURRENT_PERIOD_AGG]?: PeriodMetricBucket;
  [PREVIOUS_PERIOD_AGG]?: PeriodMetricBucket;
};

type FilteredCardinalityBucket = estypes.AggregationsFilterAggregate & {
  count?: estypes.AggregationsCardinalityAggregate;
};

type FilteredSumBucket = estypes.AggregationsFilterAggregate & {
  metric?: estypes.AggregationsSumAggregate;
};

type RankingAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
  [TOTAL_COUNT_AGG]?: FilteredCardinalityBucket;
};

type TopAggs = RankingAggs & {
  ranking?: estypes.AggregationsSingleBucketAggregateBase & RankingAggs;
  total_credit_micro?: FilteredSumBucket;
};

function dateRangeFilter(
  period: ConsumptionPeriod
): estypes.QueryDslQueryContainer {
  return {
    range: {
      [COMPLETED_AT_FIELD]: { gte: period.startDate, lt: period.endDate },
    },
  };
}

function periodMetricAggs(
  unit: ConsumptionTopUnit,
  period: ConsumptionPeriod,
  { withMessages }: { withMessages: boolean }
): estypes.AggregationsAggregationContainer {
  return {
    filter: dateRangeFilter(period),
    aggs: {
      [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
      ...(withMessages && unit === "message"
        ? { [MESSAGES_AGG]: { cardinality: { field: AGENT_MESSAGE_ID_FIELD } } }
        : {}),
    },
  };
}

// Builds the per-bucket sub-aggregations and the terms `order` they support,
// so the two cannot drift apart: whatever metric a sort ranks by is exactly
// the one computed here for every bucket.
function buildGroupBucketAggs({
  unit,
  sortBy,
  sortOrder,
  currentPeriod,
  previousPeriod,
}: {
  unit: ConsumptionTopUnit;
  sortBy: ConsumptionTopSortBy;
  sortOrder: ConsumptionTopSortOrder;
  currentPeriod: ConsumptionPeriod;
  previousPeriod: ConsumptionPeriod;
}): {
  aggs: Record<string, estypes.AggregationsAggregationContainer>;
  order: Record<string, estypes.SortOrder>;
} {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    [CURRENT_PERIOD_AGG]: periodMetricAggs(unit, currentPeriod, {
      withMessages: true,
    }),
  };

  if (sortBy === "vsPrev") {
    aggs[PREVIOUS_PERIOD_AGG] = periodMetricAggs(unit, previousPeriod, {
      withMessages: false,
    });
    aggs[GROWTH_AGG] = {
      bucket_script: {
        buckets_path: {
          current: `${CURRENT_PERIOD_AGG}>${CREDIT_AGG}`,
          previous: `${PREVIOUS_PERIOD_AGG}>${CREDIT_AGG}`,
        },
        script:
          `params.previous > 0 ` +
          `? (params.current - params.previous) / params.previous ` +
          `: ${NO_PREVIOUS_DATA_GROWTH_SENTINEL}`,
      },
    };
    return { aggs, order: { [GROWTH_AGG]: sortOrder } };
  }

  if (sortBy === "avgCredits") {
    const countPath =
      unit === "message"
        ? `${CURRENT_PERIOD_AGG}>${MESSAGES_AGG}`
        : `${CURRENT_PERIOD_AGG}>_count`;
    aggs[AVG_CREDITS_AGG] = {
      bucket_script: {
        buckets_path: {
          credit: `${CURRENT_PERIOD_AGG}>${CREDIT_AGG}`,
          count: countPath,
        },
        script: "params.count > 0 ? params.credit / params.count : 0",
      },
    };
    return { aggs, order: { [AVG_CREDITS_AGG]: sortOrder } };
  }

  return {
    aggs,
    order: { [`${CURRENT_PERIOD_AGG}>${CREDIT_AGG}`]: sortOrder },
  };
}

function countFromBucket(
  bucket: GroupBucket,
  unit: ConsumptionTopUnit
): number {
  const current = bucket[CURRENT_PERIOD_AGG];
  switch (unit) {
    case "message":
      return Math.round(current?.[MESSAGES_AGG]?.value ?? 0);
    case "invocation":
      // One tool document is one invocation, so the bucket counts itself. A
      // multi-valued dimension (a tool call attributed to several skills) puts
      // the same document in several buckets, which is the intent: each skill is
      // credited with the invocation it is responsible for.
      return current?.doc_count ?? 0;
    default:
      assertNever(unit);
  }
}

// A filter aggregation always returns a bucket, even with zero matching docs,
// unlike the previous-credits terms lookup below where an absent key means no
// prior activity at all. Read that same "no data" meaning off doc_count.
function previousCreditsFromBucket(bucket: GroupBucket): number | null {
  const previous = bucket[PREVIOUS_PERIOD_AGG];
  if (!previous || previous.doc_count === 0) {
    return null;
  }
  return microCreditsToCredits(previous[CREDIT_AGG]?.value ?? 0);
}

function buildConsumptionTopSearchTermsQuery(
  dimensionField: string,
  matchingValues: string[]
): estypes.QueryDslQueryContainer {
  const termsClauses = chunk(matchingValues, MAX_ES_TERMS_QUERY_VALUES).map(
    (values) => ({ terms: { [dimensionField]: values } })
  );
  const [firstClause, ...remainingClauses] = termsClauses;

  if (!firstClause) {
    return { match_none: {} };
  }

  if (remainingClauses.length === 0) {
    return firstClause;
  }

  // Count the bool query itself and each terms clause, as search_store.rs does.
  const clauseCount = termsClauses.length + 1;
  if (clauseCount > MAX_ES_QUERY_CLAUSES) {
    throw new Error(
      `Consumption ranking search requires ${clauseCount} Elasticsearch clauses, ` +
        `the max is ${MAX_ES_QUERY_CLAUSES}.`
    );
  }

  return {
    bool: {
      should: [firstClause, ...remainingClauses],
      minimum_should_match: 1,
    },
  };
}

async function resolveConsumptionTopSearchFilter(
  auth: Authenticator,
  {
    dimension,
    search,
  }: {
    dimension: ConsumptionScopeDimension;
    search?: string;
  }
): Promise<estypes.QueryDslQueryContainer | null> {
  const normalizedSearch = search?.trim().toLowerCase();
  if (!normalizedSearch) {
    return null;
  }

  // TODO(2026-08-14 aubin): Store searchable dimension names in consumption
  // analytics documents so Elasticsearch can perform this search directly.
  const catalog = await listConsumptionFacetCatalogDimension(auth, dimension);
  const matchingValues = catalog
    .filter((entry) => entry.label.toLowerCase().includes(normalizedSearch))
    .map((entry) => entry.value);

  return buildConsumptionTopSearchTermsQuery(
    CONSUMPTION_DIMENSION_FIELDS[dimension],
    matchingValues
  );
}

function buildConsumptionTopAggregations({
  dimension,
  bucketCount,
  excludedKeys,
  searchFilter,
  sortBy,
  sortOrder,
  currentPeriod,
  previousPeriod,
}: {
  dimension: ConsumptionScopeDimension;
  bucketCount: number;
  excludedKeys: string[];
  searchFilter: estypes.QueryDslQueryContainer | null;
  sortBy: ConsumptionTopSortBy;
  sortOrder: ConsumptionTopSortOrder;
  currentPeriod: ConsumptionPeriod;
  previousPeriod: ConsumptionPeriod;
}): Record<string, estypes.AggregationsAggregationContainer> {
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const dimensionField = CONSUMPTION_DIMENSION_FIELDS[dimension];

  const { aggs: groupBucketAggs, order } = buildGroupBucketAggs({
    unit,
    sortBy,
    sortOrder,
    currentPeriod,
    previousPeriod,
  });

  // Wrapped in the same current-period filter as every group bucket's own
  // metrics, so these totals stay scoped to the current period even when the
  // outer query window is widened (vs-prev sort) to see prior-period docs too.
  const rankingAggregations = {
    by_group: {
      terms: {
        field: dimensionField,
        size: bucketCount,
        order,
        ...(excludedKeys.length > 0 ? { exclude: excludedKeys } : {}),
      },
      aggs: groupBucketAggs,
    },
    [TOTAL_COUNT_AGG]: {
      filter: dateRangeFilter(currentPeriod),
      aggs: {
        count: {
          cardinality: {
            field: dimensionField,
            precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
          },
        },
      },
    },
  } satisfies Record<string, estypes.AggregationsAggregationContainer>;

  const rankingRootAggregations = searchFilter
    ? {
        ranking: {
          filter: searchFilter,
          aggs: rankingAggregations,
        },
      }
    : rankingAggregations;

  return {
    ...rankingRootAggregations,
    total_credit_micro: {
      filter: dateRangeFilter(currentPeriod),
      aggs: { metric: { sum: { field: CREDIT_MICRO_FIELD } } },
    },
  };
}

type FlatGroupBucket = {
  key: string;
  doc_count: number;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
};

type PreviousCreditsAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<FlatGroupBucket>;
};

// Sums credits per key over `previousPeriod`, scoped to exactly the keys
// passed in (the current page's ranking) rather than re-ranking that window,
// since we only need those keys' prior credits to compute their growth.
async function fetchConsumptionPreviousCredits(
  auth: Authenticator,
  {
    dimension,
    previousPeriod,
    filter,
    keys,
  }: {
    dimension: ConsumptionScopeDimension;
    previousPeriod: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
    keys: string[];
  }
): Promise<Result<Map<string, number>, ElasticsearchError>> {
  if (keys.length === 0) {
    return new Ok(new Map());
  }

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: previousPeriod.startDate,
    endDate: previousPeriod.endDate,
    filter,
  });

  const result = await searchConsumptionAnalytics<never, PreviousCreditsAggs>(
    query,
    {
      aggregations: {
        by_group: {
          terms: {
            field: CONSUMPTION_DIMENSION_FIELDS[dimension],
            include: keys,
            size: keys.length,
          },
          aggs: { [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } } },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<FlatGroupBucket>(
    result.value.aggregations?.by_group?.buckets
  );

  return new Ok(
    new Map(
      buckets.map((bucket) => [
        String(bucket.key),
        microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
      ])
    )
  );
}

/**
 * Top `limit` keys of `dimension` by gross credits over the period, with the
 * count each one's average is denominated in.
 */
export async function fetchConsumptionTopGroups(
  auth: Authenticator,
  {
    dimension,
    period,
    limit,
    offset = 0,
    search,
    filter,
    sortBy = "credits",
    sortOrder = "desc",
  }: {
    dimension: ConsumptionScopeDimension;
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
    sortBy?: ConsumptionTopSortBy;
    sortOrder?: ConsumptionTopSortOrder;
  }
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const searchFilter = await resolveConsumptionTopSearchFilter(auth, {
    dimension,
    search,
  });

  const previousPeriod = previousConsumptionPeriod(period);

  // Ranking by growth needs prior-period documents in view, since each
  // bucket's own previous_period sub-aggregation reads them from this same
  // query. Every other sort only ever looks at the current period, and stays
  // scoped to it exactly as before.
  const query = buildConsumptionScopeQuery({
    auth,
    startDate:
      sortBy === "vsPrev" ? previousPeriod.startDate : period.startDate,
    endDate: period.endDate,
    filter,
  });

  const requestedBucketCount = offset + limit;
  const rankedGroups: ConsumptionTopGroup[] = [];
  let buckets: GroupBucket[];
  let batchSize = 0;
  let totalCount = 0;
  let totalCredits = 0;

  // Terms aggregations do not expose an after_key when ordered by a metric.
  // Continue the ranked result in bounded batches by excluding the keys
  // already returned, and stop as soon as the requested page is available.
  do {
    batchSize = Math.min(
      requestedBucketCount - rankedGroups.length,
      RANKING_TERMS_PAGE_SIZE
    );
    const aggregations = buildConsumptionTopAggregations({
      dimension,
      bucketCount: batchSize,
      excludedKeys: rankedGroups.map((group) => group.key),
      searchFilter,
      sortBy,
      sortOrder,
      currentPeriod: period,
      previousPeriod,
    });
    const result = await searchConsumptionAnalytics<never, TopAggs>(query, {
      aggregations,
      size: 0,
    });

    if (result.isErr()) {
      return result;
    }

    const ranking = searchFilter
      ? result.value.aggregations?.ranking
      : result.value.aggregations;
    buckets = bucketsToArray<GroupBucket>(ranking?.by_group?.buckets);
    rankedGroups.push(
      ...buckets.map((bucket) => ({
        key: String(bucket.key),
        credits: microCreditsToCredits(
          bucket[CURRENT_PERIOD_AGG]?.[CREDIT_AGG]?.value ?? 0
        ),
        count: countFromBucket(bucket, CONSUMPTION_DIMENSION_UNIT[dimension]),
        previousCredits:
          sortBy === "vsPrev" ? previousCreditsFromBucket(bucket) : null,
      }))
    );
    totalCredits = microCreditsToCredits(
      result.value.aggregations?.total_credit_micro?.metric?.value ?? 0
    );
    totalCount = Math.round(ranking?.[TOTAL_COUNT_AGG]?.count?.value ?? 0);
  } while (
    rankedGroups.length < requestedBucketCount &&
    buckets.length === batchSize
  );

  const pagedGroups = rankedGroups.slice(offset, offset + limit);

  // vs-prev sort already computed each group's previous-period credits as
  // part of the ranking query above. Every other sort still needs this
  // separate lookup, scoped to just the page's keys.
  if (sortBy === "vsPrev") {
    return new Ok({
      groups: pagedGroups,
      hasMore: totalCount > offset + limit,
      totalCount,
      totalCredits,
    });
  }

  const previousCreditsResult = await fetchConsumptionPreviousCredits(auth, {
    dimension,
    previousPeriod,
    filter,
    keys: pagedGroups.map((group) => group.key),
  });
  // The prior-period lookup only feeds the vs-prev display column: a failure
  // there should not take down the current-period ranking, which already
  // succeeded. Fall back to unknown growth for every group instead.
  if (previousCreditsResult.isErr()) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        dimension,
        err: previousCreditsResult.error,
      },
      "[ConsumptionAnalytics] Failed to fetch previous-period credits, " +
        "falling back to null vs-prev values."
    );
  }
  const previousCreditsByKey = previousCreditsResult.isOk()
    ? previousCreditsResult.value
    : new Map<string, number>();

  return new Ok({
    groups: pagedGroups.map((group) => ({
      ...group,
      previousCredits: previousCreditsByKey.get(group.key) ?? null,
    })),
    hasMore: totalCount > offset + limit,
    totalCount,
    totalCredits,
  });
}

// A group can hold credits with nothing to divide them by — a message whose id
// was never indexed, a bucket the count agg saw as empty. Report 0 rather than a
// non-finite average.
export function avgCreditsPerUnit(credits: number, count: number): number {
  return count > 0 ? credits / count : 0;
}

export type ResolvedConsumptionGroup = {
  key: string;
  name: string;
  pictureUrl: string | null;
  description: string | null;
  // Only agents have model metadata.
  modelId?: string;
  modelDisplayName?: string;
  // Only skills have an icon.
  icon?: string | null;
  credits: number;
  count: number;
  avgCredits: number;
  previousCredits: number | null;
};

export async function resolveConsumptionGroupLabels(
  auth: Authenticator,
  dimension: ConsumptionScopeDimension,
  groups: ConsumptionTopGroup[]
): Promise<ResolvedConsumptionGroup[]> {
  const labels = await resolveDimensionLabels(
    auth,
    dimension,
    groups.map((group) => group.key)
  );

  return groups.map((group) => ({
    key: group.key,
    name: labels.get(group.key)?.name ?? group.key,
    pictureUrl: labels.get(group.key)?.pictureUrl ?? null,
    description: labels.get(group.key)?.description ?? null,
    modelId: labels.get(group.key)?.modelId,
    modelDisplayName: labels.get(group.key)?.modelDisplayName,
    icon: labels.get(group.key)?.icon,
    credits: group.credits,
    count: group.count,
    avgCredits: avgCreditsPerUnit(group.credits, group.count),
    previousCredits: group.previousCredits,
  }));
}
