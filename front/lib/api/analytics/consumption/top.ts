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

export type ConsumptionTopGroup = {
  key: string;
  credits: number;
  // Distinct messages, or tool invocations, per the ranking's unit.
  count: number;
};

export type ConsumptionTopGroups = {
  groups: ConsumptionTopGroup[];
  // Gross credits over the whole scoped period, every document included. Not the
  // sum of `groups` — the ranking is capped at `limit`, and a dimension that only
  // exists on some documents (a tool, a skill) accounts for part of the total.
  totalCredits: number;
};

// Sub-aggregation names, kept out of the callers so the ranking order and the
// bucket reads below cannot drift apart.
const CREDIT_AGG = "credit_micro";
const MESSAGES_AGG = "messages";

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

type TopAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
  total_credit_micro?: estypes.AggregationsSumAggregate;
};

// Composite source name for the paginated (export) ranking, kept private to
// this module.
const GROUP_SOURCE = "group";

type CompositeGroupBucket = {
  key: Record<typeof GROUP_SOURCE, string>;
  doc_count: number;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [MESSAGES_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type CompositeTopAggs = {
  by_group?: estypes.AggregationsCompositeAggregate & {
    buckets: CompositeGroupBucket[];
  };
  total_credit_micro?: estypes.AggregationsSumAggregate;
};

const EXPORT_PAGE_SIZE = 10_000;

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
    unit,
    period,
    limit,
    filter,
  }: {
    dimension: ConsumptionScopeDimension;
    unit: ConsumptionTopUnit;
    period: ConsumptionPeriod;
    limit: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const result = await searchConsumptionAnalytics<never, TopAggs>(query, {
    aggregations: {
      by_group: {
        terms: {
          field: CONSUMPTION_DIMENSION_FIELDS[dimension],
          size: limit,
          order: { [CREDIT_AGG]: "desc" },
        },
        aggs: subAggs(unit),
      },
      total_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const groups = bucketsToArray<GroupBucket>(
    result.value.aggregations?.by_group?.buckets
  ).map((bucket) => ({
    key: String(bucket.key),
    credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
    count: countFromBucket(bucket, unit),
  }));

  return new Ok({
    groups,
    totalCredits: microCreditsToCredits(
      result.value.aggregations?.total_credit_micro?.value ?? 0
    ),
  });
}

/**
 * Every key of `dimension` by gross credits over the period, with no cap
 */
export async function fetchConsumptionAllGroups(
  auth: Authenticator,
  {
    dimension,
    unit,
    period,
    filter,
  }: {
    dimension: ConsumptionScopeDimension;
    unit: ConsumptionTopUnit;
    period: ConsumptionPeriod;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const buckets: GroupBucket[] = [];
  let totalCreditsMicro = 0;
  let afterKey: estypes.AggregationsCompositeAggregateKey | undefined;

  for (;;) {
    const result = await searchConsumptionAnalytics<never, CompositeTopAggs>(
      query,
      {
        aggregations: {
          by_group: {
            composite: {
              size: EXPORT_PAGE_SIZE,
              sources: [
                {
                  [GROUP_SOURCE]: {
                    terms: { field: CONSUMPTION_DIMENSION_FIELDS[dimension] },
                  },
                },
              ],
              ...(afterKey ? { after: afterKey } : {}),
            },
            aggs: subAggs(unit),
          },
          total_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
        },
        size: 0,
      }
    );

    if (result.isErr()) {
      return result;
    }

    const page = result.value.aggregations?.by_group;
    const pageBuckets = bucketsToArray<CompositeGroupBucket>(page?.buckets);
    buckets.push(
      ...pageBuckets.map(
        (bucket): GroupBucket => ({
          key: String(bucket.key[GROUP_SOURCE]),
          doc_count: bucket.doc_count,
          [CREDIT_AGG]: bucket[CREDIT_AGG],
          [MESSAGES_AGG]: bucket[MESSAGES_AGG],
        })
      )
    );
    // The overall total does not depend on the composite cursor, but the
    // aggregation is cheap to repeat and this keeps every page self-contained.
    totalCreditsMicro =
      result.value.aggregations?.total_credit_micro?.value ?? totalCreditsMicro;

    if (!page?.after_key || pageBuckets.length < EXPORT_PAGE_SIZE) {
      break;
    }
    afterKey = page.after_key;
  }

  const groups = buckets
    .map((bucket) => ({
      key: bucket.key,
      credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
      count: countFromBucket(bucket, unit),
    }))
    .sort((a, b) => b.credits - a.credits);

  return new Ok({
    groups,
    totalCredits: microCreditsToCredits(totalCreditsMicro),
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
    credits: group.credits,
    count: group.count,
    avgCredits: avgCreditsPerUnit(group.credits, group.count),
  }));
}
