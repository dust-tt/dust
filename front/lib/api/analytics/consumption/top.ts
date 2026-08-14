import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
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
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const dimensionField = CONSUMPTION_DIMENSION_FIELDS[dimension];
  const normalizedSearch = search?.trim().toLowerCase();

  let matchingValues: string[] | undefined;
  if (normalizedSearch) {
    const catalog = await listConsumptionFacetCatalog(auth);
    matchingValues = catalog[dimension]
      .filter((entry) => entry.label.toLowerCase().includes(normalizedSearch))
      .map((entry) => entry.value);
  }

  const rankingFilter: estypes.QueryDslQueryContainer | null = matchingValues
    ? matchingValues.length > 0
      ? { terms: { [dimensionField]: matchingValues } }
      : { match_none: {} }
    : null;

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const requestedBucketCount = offset + limit;
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

  const result = await searchConsumptionAnalytics<never, TopAggs>(query, {
    aggregations: {
      ...(rankingFilter
        ? { ranking: { filter: rankingFilter, aggs: rankingAggregations } }
        : rankingAggregations),
      total_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const ranking = rankingFilter
    ? result.value.aggregations?.ranking
    : result.value.aggregations;
  const rankedGroups = bucketsToArray<GroupBucket>(
    ranking?.by_group?.buckets
  ).map((bucket) => ({
    key: String(bucket.key),
    credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
    count: countFromBucket(bucket, unit),
  }));
  const totalCount = Math.round(ranking?.[TOTAL_COUNT_AGG]?.value ?? 0);

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
