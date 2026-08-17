import { listConsumptionFacetCatalogDimension } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { previousConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
  ConsumptionTopUnit,
} from "@app/lib/api/analytics/consumption/scope";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
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
// Nested filter aggregations that isolate the current and previous period
// within a single query spanning both, so the ranking and the vs-prev
// credits come back in one Elasticsearch round trip.
const CURRENT_PERIOD_AGG = "current_period";
const PREVIOUS_PERIOD_AGG = "previous_period";
const CARDINALITY_PRECISION_THRESHOLD = 40_000;
const MAX_ES_QUERY_CLAUSES = 1_024;
const MAX_ES_TERMS_QUERY_VALUES = 65_536;

type PeriodBucket = estypes.AggregationsSingleBucketAggregateBase & {
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [MESSAGES_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type GroupBucket = {
  key: string;
  [CURRENT_PERIOD_AGG]?: PeriodBucket;
  [PREVIOUS_PERIOD_AGG]?: PeriodBucket;
};

function subAggs(unit: ConsumptionTopUnit) {
  return {
    [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
    ...(unit === "message"
      ? { [MESSAGES_AGG]: { cardinality: { field: AGENT_MESSAGE_ID_FIELD } } }
      : {}),
  };
}

function periodRangeFilter(
  period: ConsumptionPeriod
): estypes.QueryDslQueryContainer {
  return {
    range: {
      [COMPLETED_AT_FIELD]: { gte: period.startDate, lt: period.endDate },
    },
  };
}

type RankingAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
  [TOTAL_COUNT_AGG]?: estypes.AggregationsSingleBucketAggregateBase & {
    count?: estypes.AggregationsCardinalityAggregate;
  };
};

type TopAggs = RankingAggs & {
  ranking?: estypes.AggregationsSingleBucketAggregateBase & RankingAggs;
  total_credit_micro?: estypes.AggregationsSingleBucketAggregateBase & {
    value?: estypes.AggregationsSumAggregate;
  };
};

function countFromBucket(
  current: PeriodBucket | undefined,
  unit: ConsumptionTopUnit
): number {
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
  limit,
  offset,
  searchFilter,
  period,
  previousPeriod,
}: {
  dimension: ConsumptionScopeDimension;
  limit: number;
  offset: number;
  searchFilter: estypes.QueryDslQueryContainer | null;
  period: ConsumptionPeriod;
  previousPeriod: ConsumptionPeriod;
}): Record<string, estypes.AggregationsAggregationContainer> {
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const dimensionField = CONSUMPTION_DIMENSION_FIELDS[dimension];

  // TODO(2026-08-14 aubin): Add pagination beyond the maximum bucket count.
  const requestedBucketCount = offset + limit;
  // The query spans both periods (see fetchConsumptionTopGroups), so a term
  // active only in the previous period can otherwise consume a terms
  // candidate slot ahead of a real current-period contender. Padding
  // shard_size makes that far less likely without changing what's returned.
  const shardSize = requestedBucketCount * 3 + 50;

  const rankingAggregations = {
    by_group: {
      terms: {
        field: dimensionField,
        size: requestedBucketCount,
        shard_size: shardSize,
        order: { [`${CURRENT_PERIOD_AGG}>${CREDIT_AGG}`]: "desc" },
      },
      aggs: {
        [CURRENT_PERIOD_AGG]: {
          filter: periodRangeFilter(period),
          aggs: subAggs(unit),
        },
        [PREVIOUS_PERIOD_AGG]: {
          filter: periodRangeFilter(previousPeriod),
          aggs: { [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } } },
        },
      },
    },
    [TOTAL_COUNT_AGG]: {
      filter: periodRangeFilter(period),
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
      filter: periodRangeFilter(period),
      aggs: { value: { sum: { field: CREDIT_MICRO_FIELD } } },
    },
  };
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
  }: {
    dimension: ConsumptionScopeDimension;
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const searchFilter = await resolveConsumptionTopSearchFilter(auth, {
    dimension,
    search,
  });

  const previousPeriod = previousConsumptionPeriod(period);

  // A single query over the union of both periods, so the ranking and the
  // vs-prev credits come back in one Elasticsearch round trip instead of two.
  // previousPeriod.endDate is always period.startDate (see
  // previousConsumptionPeriod), so the union range is contiguous.
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: previousPeriod.startDate,
    endDate: period.endDate,
    filter,
  });

  const aggregations = buildConsumptionTopAggregations({
    dimension,
    limit,
    offset,
    searchFilter,
    period,
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
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const rankedGroups = bucketsToArray<GroupBucket>(ranking?.by_group?.buckets)
    // A bucket with no current-period activity only exists to let its
    // previous-period volume compete for a terms candidate slot; it never
    // belongs in the ranking itself.
    .filter((bucket) => (bucket[CURRENT_PERIOD_AGG]?.doc_count ?? 0) > 0)
    .map((bucket) => {
      const current = bucket[CURRENT_PERIOD_AGG];
      const previous = bucket[PREVIOUS_PERIOD_AGG];
      return {
        key: String(bucket.key),
        credits: microCreditsToCredits(current?.[CREDIT_AGG]?.value ?? 0),
        count: countFromBucket(current, unit),
        previousCredits:
          previous && previous.doc_count > 0
            ? microCreditsToCredits(previous[CREDIT_AGG]?.value ?? 0)
            : null,
      };
    });
  const totalCount = Math.round(ranking?.[TOTAL_COUNT_AGG]?.count?.value ?? 0);
  const pagedGroups = rankedGroups.slice(offset, offset + limit);

  return new Ok({
    groups: pagedGroups,
    hasMore: totalCount > offset + limit,
    totalCount,
    totalCredits: microCreditsToCredits(
      result.value.aggregations?.total_credit_micro?.value?.value ?? 0
    ),
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
