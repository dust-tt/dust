import { listConsumptionFacetCatalogDimension } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { previousConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopDimension,
  ConsumptionTopRankBy,
  ConsumptionTopSortOrder,
  ConsumptionTopUnit,
} from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONSUMPTION_TOP_DIMENSION_FIELDS,
  CONSUMPTION_TOP_DIMENSION_UNIT,
  CREDIT_MICRO_FIELD,
  uniqueMessagesCardinalityAgg,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { removeDiacritics } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";
import chunk from "lodash/chunk";

export type ConsumptionTopGroup = {
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
const RANKING_TERMS_PAGE_SIZE = 1_000;
const MAX_ES_QUERY_CLAUSES = 1_024;
const MAX_ES_TERMS_QUERY_VALUES = 65_536;

type GroupBucket = {
  key: string;
  doc_count: number;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [MESSAGES_AGG]?: estypes.AggregationsCardinalityAggregate;
};

function subAggs(unit: ConsumptionTopUnit) {
  return {
    [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
    ...(unit === "message"
      ? { [MESSAGES_AGG]: uniqueMessagesCardinalityAgg() }
      : {}),
  };
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
    dimension: ConsumptionTopDimension;
    search?: string;
  }
): Promise<estypes.QueryDslQueryContainer | null> {
  if (dimension === "conversation" || dimension === "tag") {
    return null;
  }

  const normalizedSearch = removeDiacritics(search?.trim() ?? "").toLowerCase();
  if (!normalizedSearch) {
    return null;
  }

  if (dimension === "reasoning_effort") {
    return buildConsumptionTopSearchTermsQuery(
      CONSUMPTION_TOP_DIMENSION_FIELDS[dimension],
      ORDERED_REASONING_EFFORTS.filter((effort) =>
        effort.includes(normalizedSearch)
      )
    );
  }

  // TODO(2026-08-14 aubin): Store searchable dimension names in consumption
  // analytics documents so Elasticsearch can perform this search directly.
  const catalog = await listConsumptionFacetCatalogDimension(auth, dimension);
  const matchingValues = catalog
    .filter((entry) =>
      removeDiacritics(entry.label).toLowerCase().includes(normalizedSearch)
    )
    .map((entry) => entry.value);

  return buildConsumptionTopSearchTermsQuery(
    CONSUMPTION_DIMENSION_FIELDS[dimension],
    matchingValues
  );
}

function rankingOrder(
  dimension: ConsumptionTopDimension,
  rankBy: ConsumptionTopRankBy,
  sortOrder: ConsumptionTopSortOrder
): Record<string, ConsumptionTopSortOrder> {
  if (rankBy === "credits") {
    return { [CREDIT_AGG]: sortOrder };
  }

  switch (CONSUMPTION_TOP_DIMENSION_UNIT[dimension]) {
    case "message":
      return { [MESSAGES_AGG]: sortOrder };
    case "invocation":
      return { _count: sortOrder };
    default:
      return assertNever(CONSUMPTION_TOP_DIMENSION_UNIT[dimension]);
  }
}

function buildConsumptionTopAggregations({
  dimension,
  bucketCount,
  excludedKeys,
  searchFilter,
  sortOrder,
  rankBy,
  includeTotalCount,
}: {
  dimension: ConsumptionTopDimension;
  bucketCount: number;
  excludedKeys: string[];
  searchFilter: estypes.QueryDslQueryContainer | null;
  sortOrder: ConsumptionTopSortOrder;
  rankBy: ConsumptionTopRankBy;
  includeTotalCount: boolean;
}): Record<string, estypes.AggregationsAggregationContainer> {
  const unit = CONSUMPTION_TOP_DIMENSION_UNIT[dimension];
  const dimensionField = CONSUMPTION_TOP_DIMENSION_FIELDS[dimension];

  const rankingAggregations = {
    by_group: {
      terms: {
        field: dimensionField,
        size: bucketCount,
        order: rankingOrder(dimension, rankBy, sortOrder),
        ...(excludedKeys.length > 0 ? { exclude: excludedKeys } : {}),
      },
      aggs: subAggs(unit),
    },
    ...(includeTotalCount
      ? {
          [TOTAL_COUNT_AGG]: {
            cardinality: {
              field: dimensionField,
              precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
            },
          },
        }
      : {}),
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
    dimension: ConsumptionTopDimension;
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
            field: CONSUMPTION_TOP_DIMENSION_FIELDS[dimension],
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
    sortOrder = "desc",
    rankBy = "credits",
    includePreviousCredits = true,
    includeTotalCount = true,
  }: {
    dimension: ConsumptionTopDimension;
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
    sortOrder?: ConsumptionTopSortOrder;
    rankBy?: ConsumptionTopRankBy;
    includePreviousCredits?: boolean;
    includeTotalCount?: boolean;
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

  const requestedBucketCount = offset + limit;
  const rankedGroups: Omit<ConsumptionTopGroup, "previousCredits">[] = [];
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
      sortOrder,
      rankBy,
      includeTotalCount,
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
        count: countFromBucket(
          bucket,
          CONSUMPTION_TOP_DIMENSION_UNIT[dimension]
        ),
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

  const pagedGroups = rankedGroups.slice(offset, offset + limit);

  const previousCreditsResult = await fetchConsumptionPreviousCredits(auth, {
    dimension,
    previousPeriod: previousConsumptionPeriod(period),
    filter,
    keys: includePreviousCredits ? pagedGroups.map((group) => group.key) : [],
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
  dimension: ConsumptionTopDimension,
  groups: ConsumptionTopGroup[]
): Promise<ResolvedConsumptionGroup[]> {
  const labels = await resolveDimensionLabels(
    auth,
    dimension,
    groups.map((group) => group.key)
  );

  const visibleGroups =
    dimension === "conversation"
      ? groups.filter((group) => labels.has(group.key))
      : groups;

  return visibleGroups.map((group) => ({
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
