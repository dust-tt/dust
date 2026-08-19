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
// Ranks "invocation" dimensions by avg credits: one document is one
// invocation there, so a plain avg metric already equals credits per unit,
// and terms aggregations can order buckets by it directly.
const AVG_CREDIT_PER_INVOCATION_AGG = "avg_credit_per_invocation";
const RANKING_TERMS_PAGE_SIZE = 1_000;
const MAX_ES_QUERY_CLAUSES = 1_024;
const MAX_ES_TERMS_QUERY_VALUES = 65_536;

type GroupBucket = {
  key: string;
  doc_count: number;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [MESSAGES_AGG]?: estypes.AggregationsCardinalityAggregate;
  [AVG_CREDIT_PER_INVOCATION_AGG]?: estypes.AggregationsAvgAggregate;
};

// Only worth computing when the ranking actually orders by it.
function subAggs(unit: ConsumptionTopUnit, sortBy: ConsumptionTopSortBy) {
  return {
    [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
    ...(unit === "message"
      ? { [MESSAGES_AGG]: { cardinality: { field: AGENT_MESSAGE_ID_FIELD } } }
      : {}),
    ...(sortBy === "avgCredits" && unit === "invocation"
      ? {
          [AVG_CREDIT_PER_INVOCATION_AGG]: {
            avg: { field: CREDIT_MICRO_FIELD },
          },
        }
      : {}),
  };
}

// The sub-aggregation a terms aggregation orders its buckets by for a given
// ranking metric and unit. "message" dimensions ranked by avg credits are a
// ratio of two metrics (summed credits over distinct message count):
// Elasticsearch terms aggregations can only order by a genuine metric
// aggregation (avg, sum, cardinality, ...), not a ratio, so that case orders
// by credits here and is re-ranked by average in memory afterwards.
function orderAggName(
  sortBy: ConsumptionTopSortBy,
  unit: ConsumptionTopUnit
): string {
  if (sortBy === "avgCredits" && unit === "invocation") {
    return AVG_CREDIT_PER_INVOCATION_AGG;
  }
  return CREDIT_AGG;
}

type RankingAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
  [TOTAL_COUNT_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type TopAggs = RankingAggs & {
  ranking?: estypes.AggregationsSingleBucketAggregateBase & RankingAggs;
  total_credit_micro?: estypes.AggregationsSumAggregate;
};

function countFromBucket(
  bucket: GroupBucket,
  unit: ConsumptionTopUnit
): number {
  switch (unit) {
    case "message":
      return Math.round(bucket[MESSAGES_AGG]?.value ?? 0);
    case "invocation":
      // One tool document is one invocation, so the bucket counts itself. A
      // multi-valued dimension (a tool call attributed to several skills) puts
      // the same document in several buckets, which is the intent: each skill is
      // credited with the invocation it is responsible for.
      return bucket.doc_count;
    default:
      assertNever(unit);
  }
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
}: {
  dimension: ConsumptionScopeDimension;
  bucketCount: number;
  excludedKeys: string[];
  searchFilter: estypes.QueryDslQueryContainer | null;
  sortBy: ConsumptionTopSortBy;
  sortOrder: ConsumptionTopSortOrder;
}): Record<string, estypes.AggregationsAggregationContainer> {
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const dimensionField = CONSUMPTION_DIMENSION_FIELDS[dimension];

  const rankingAggregations = {
    by_group: {
      terms: {
        field: dimensionField,
        size: bucketCount,
        order: { [orderAggName(sortBy, unit)]: sortOrder },
        ...(excludedKeys.length > 0 ? { exclude: excludedKeys } : {}),
      },
      aggs: subAggs(unit, sortBy),
    },
    [TOTAL_COUNT_AGG]: {
      cardinality: {
        field: dimensionField,
        precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
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
    total_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
  };
}

type PreviousCreditsAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
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

  const buckets = bucketsToArray<GroupBucket>(
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

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  // Elasticsearch cannot order terms buckets by a ratio of two metrics —
  // summed credits over distinct message count for a "message" dimension's
  // avg credits, or current credits over previous-period credits for a
  // vs-prev sort. Both require fetching every bucket and ranking in memory,
  // rather than relying on the requested page's size.
  const sortInMemory =
    sortBy === "vsPrev" ||
    (sortBy === "avgCredits" &&
      CONSUMPTION_DIMENSION_UNIT[dimension] === "message");
  const requestedBucketCount = sortInMemory
    ? Number.MAX_SAFE_INTEGER
    : offset + limit;
  const rankedGroups: Omit<ConsumptionTopGroup, "previousCredits">[] = [];
  let buckets: GroupBucket[];
  let batchSize = 0;
  let totalCount = 0;
  let totalCredits = 0;

  // Terms aggregations do not expose an after_key when ordered by a metric.
  // Continue the ranked result in bounded batches by excluding the keys
  // already returned, and stop as soon as the requested page is available
  // (or, when sorting in memory, once every bucket has been fetched).
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
        credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
        count: countFromBucket(bucket, CONSUMPTION_DIMENSION_UNIT[dimension]),
      }))
    );
    totalCredits = microCreditsToCredits(
      result.value.aggregations?.total_credit_micro?.value ?? 0
    );
    totalCount = Math.round(ranking?.[TOTAL_COUNT_AGG]?.value ?? 0);
  } while (
    rankedGroups.length < requestedBucketCount &&
    buckets.length === batchSize
  );

  // A vs-prev sort ranks every group by growth, which needs each one's
  // previous-period credits up front — not just the page's, since a group
  // outside the requested page can still outrank one inside it.
  let previousCreditsByKey = new Map<string, number>();
  if (sortBy === "vsPrev") {
    previousCreditsByKey = await fetchPreviousCreditsWithFallback(auth, {
      dimension,
      previousPeriod: previousConsumptionPeriod(period),
      filter,
      keys: rankedGroups.map((group) => group.key),
    });
  }

  const sortedGroups =
    sortBy === "vsPrev"
      ? [...rankedGroups].sort((a, b) => {
          const diff =
            growthForSort(a.credits, previousCreditsByKey.get(a.key) ?? null) -
            growthForSort(b.credits, previousCreditsByKey.get(b.key) ?? null);
          return sortOrder === "asc" ? diff : -diff;
        })
      : sortInMemory
        ? [...rankedGroups].sort((a, b) => {
            const diff =
              avgCreditsPerUnit(a.credits, a.count) -
              avgCreditsPerUnit(b.credits, b.count);
            return sortOrder === "asc" ? diff : -diff;
          })
        : rankedGroups;
  const pagedGroups = sortedGroups.slice(offset, offset + limit);

  // vs-prev sort already looked up every group's previous-period credits
  // above; every other sort still needs that lookup, scoped to just the
  // page's keys.
  if (sortBy !== "vsPrev") {
    previousCreditsByKey = await fetchPreviousCreditsWithFallback(auth, {
      dimension,
      previousPeriod: previousConsumptionPeriod(period),
      filter,
      keys: pagedGroups.map((group) => group.key),
    });
  }

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

// A key with no prior-period credits has no ratio to rank a vs-prev sort by.
// Sink it to whichever end of the sort its magnitude puts it at, rather than
// dropping it from the ranking or dividing by zero.
const NO_PREVIOUS_DATA_GROWTH_SENTINEL = -1_000_000;

function growthForSort(
  credits: number,
  previousCredits: number | null
): number {
  return previousCredits && previousCredits > 0
    ? (credits - previousCredits) / previousCredits
    : NO_PREVIOUS_DATA_GROWTH_SENTINEL;
}

// The prior-period lookup only feeds the vs-prev display column and sort: a
// failure there should not take down the current-period ranking, which
// already succeeded. Fall back to unknown/no-growth values instead.
async function fetchPreviousCreditsWithFallback(
  auth: Authenticator,
  args: Parameters<typeof fetchConsumptionPreviousCredits>[1]
): Promise<Map<string, number>> {
  const result = await fetchConsumptionPreviousCredits(auth, args);
  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        dimension: args.dimension,
        err: result.error,
      },
      "[ConsumptionAnalytics] Failed to fetch previous-period credits, " +
        "falling back to null vs-prev values."
    );
    return new Map();
  }
  return result.value;
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
