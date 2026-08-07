import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
  creditsFromMicroCredits,
  GROSS_CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Ranking machinery shared by the `top_*` endpoints — the top consumers of
 * credits along one dimension over the period.
 *
 * Every dimension ranks on the same quantity, the gross credit total, so the
 * rankings are comparable and a row's `credits / totalCredits` is its share of
 * everything the workspace consumed over the period.
 *
 * What differs is the denominator of the average, which is why each dimension
 * gets its own endpoint rather than a `dimension` query param:
 *
 * - agent / user / model / source spread their credits over whole messages, so
 *   the average that means something is per message.
 * - tool / skill only ever appear on tool documents, one per tool call, so
 *   their average is per invocation. "Per message" would be meaningless there:
 *   a single message can call the same tool a dozen times.
 */

// Unit a ranking's count — and therefore its average — is denominated in.
type ConsumptionTopUnit = "message" | "invocation";

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

type TopAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
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
        aggs: {
          [CREDIT_AGG]: { sum: { field: GROSS_CREDIT_MICRO_FIELD } },
          ...(unit === "message"
            ? {
                [MESSAGES_AGG]: {
                  cardinality: { field: AGENT_MESSAGE_ID_FIELD },
                },
              }
            : {}),
        },
      },
      total_credit_micro: { sum: { field: GROSS_CREDIT_MICRO_FIELD } },
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
    credits: creditsFromMicroCredits(bucket[CREDIT_AGG]?.value ?? 0),
    count: countFromBucket(bucket, unit),
  }));

  return new Ok({
    groups,
    totalCredits: creditsFromMicroCredits(
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
