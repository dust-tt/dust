import { listConsumptionFacetCatalogDimension } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
  ConsumptionTopUnit,
} from "@app/lib/api/analytics/consumption/scope";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
  CONSUMPTION_DIMENSION_UNIT,
  CREDIT_MICRO_FIELD,
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
const CARDINALITY_PRECISION_THRESHOLD = 40_000;
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
      ? { [MESSAGES_AGG]: { cardinality: { field: AGENT_MESSAGE_ID_FIELD } } }
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
}: {
  dimension: ConsumptionScopeDimension;
  limit: number;
  offset: number;
  searchFilter: estypes.QueryDslQueryContainer | null;
}): Record<string, estypes.AggregationsAggregationContainer> {
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const dimensionField = CONSUMPTION_DIMENSION_FIELDS[dimension];

  // TODO(2026-08-14 aubin): Add pagination beyond the maximum bucket count.
  // A folded programmatic source frees one ranking slot.
  const requestedBucketCount =
    offset +
    limit +
    (dimension === "source" ? PROGRAMMATIC_SOURCE_ORIGIN_COUNT : 0);
  const rankingAggregations = {
    by_group: {
      terms: {
        field: dimensionField,
        size: requestedBucketCount,
        order: { [CREDIT_AGG]: "desc" },
      },
      aggs: subAggs(unit),
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

// Re-ranks, since merging two programmatic-source buckets moves the parent up.
function foldSourceGroups(
  groups: ConsumptionTopGroup[]
): ConsumptionTopGroup[] {
  const groupByKey = new Map<string, ConsumptionTopGroup>();
  for (const group of groups) {
    const key = canonicalSourceForOrigin(group.key);
    const folded = groupByKey.get(key);
    groupByKey.set(key, {
      key,
      credits: (folded?.credits ?? 0) + group.credits,
      count: (folded?.count ?? 0) + group.count,
    });
  }

  return [...groupByKey.values()].sort(
    (left, right) => right.credits - left.credits
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

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const aggregations = buildConsumptionTopAggregations({
    dimension,
    limit,
    offset,
    searchFilter,
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
  const rawGroups = bucketsToArray<GroupBucket>(
    ranking?.by_group?.buckets
  ).map((bucket) => ({
    key: String(bucket.key),
    credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
    count: countFromBucket(bucket, CONSUMPTION_DIMENSION_UNIT[dimension]),
  }));
  const totalCount = Math.round(ranking?.[TOTAL_COUNT_AGG]?.value ?? 0);
  const rankedGroups =
    dimension === "source" ? foldSourceGroups(rawGroups) : rawGroups

  return new Ok({
    groups: rankedGroups.slice(offset, offset + limit),
    hasMore: totalCount > offset + limit,
    totalCount,
    totalCredits: microCreditsToCredits(
      result.value.aggregations?.total_credit_micro?.value ?? 0
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
  }));
}
