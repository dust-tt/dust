import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionTopLimit } from "@app/lib/api/analytics/consumption/schema";
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
import { isString } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

type ConsumptionTopGroup = {
  key: string;
  credits: number;
  // Distinct messages, or tool invocations, per the ranking's unit.
  count: number;
};

export type ConsumptionTopGroups = {
  groups: ConsumptionTopGroup[];
  // Gross credits over the whole scoped period, every document included. Not the
  // sum of `groups` — a dimension that only exists on some documents (a tool, a
  // skill) accounts for part of the total, and callers can cap the ranking.
  totalCredits: number;
};

// Sub-aggregation names, kept out of the callers so the ranking order and the
// bucket reads below cannot drift apart.
const CREDIT_AGG = "credit_micro";
const MESSAGES_AGG = "messages";
const TOP_GROUPS_COMPOSITE_PAGE_SIZE = 1_000;

type GroupBucket = {
  key: string | { value: string };
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
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket> & {
    after_key?: { value: string };
  };
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

function groupFromBucket(
  bucket: GroupBucket,
  unit: ConsumptionTopUnit
): ConsumptionTopGroup {
  const key = isString(bucket.key) ? bucket.key : String(bucket.key.value);
  return {
    key,
    credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
    count: countFromBucket(bucket, unit),
  };
}

/**
 * Keys of `dimension` ranked by gross credits over the period, with the count
 * each one's average is denominated in. A numeric `limit` returns only the top
 * rows; `null` exhausts the composite aggregation before ranking every row.
 */
export async function fetchConsumptionTopGroups(
  auth: Authenticator,
  {
    dimension,
    period,
    limit,
    filter,
  }: {
    dimension: ConsumptionScopeDimension;
    period: ConsumptionPeriod;
    limit: ConsumptionTopLimit;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const unit = CONSUMPTION_DIMENSION_UNIT[dimension];
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const groups: ConsumptionTopGroup[] = [];
  let afterKey: { value: string } | undefined;
  let bucketCount: number;
  let totalCredits = 0;

  do {
    const result = await searchConsumptionAnalytics<never, TopAggs>(query, {
      aggregations: {
        by_group: {
          ...(limit === null
            ? {
                composite: {
                  size: TOP_GROUPS_COMPOSITE_PAGE_SIZE,
                  sources: [
                    {
                      value: {
                        terms: {
                          field: CONSUMPTION_DIMENSION_FIELDS[dimension],
                        },
                      },
                    },
                  ],
                  ...(afterKey ? { after: afterKey } : {}),
                },
              }
            : {
                terms: {
                  field: CONSUMPTION_DIMENSION_FIELDS[dimension],
                  size: limit,
                  order: { [CREDIT_AGG]: "desc" },
                },
              }),
          aggs: subAggs(unit),
        },
        total_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
      },
      size: 0,
    });

    if (result.isErr()) {
      return result;
    }

    const aggregation = result.value.aggregations?.by_group;
    const page = bucketsToArray<GroupBucket>(aggregation?.buckets);
    bucketCount = page.length;
    groups.push(...page.map((bucket) => groupFromBucket(bucket, unit)));
    totalCredits = microCreditsToCredits(
      result.value.aggregations?.total_credit_micro?.value ?? 0
    );

    afterKey = aggregation?.after_key;
  } while (limit === null && afterKey !== undefined && bucketCount > 0);

  return new Ok({
    groups:
      limit === null
        ? groups.sort(
            (left, right) =>
              right.credits - left.credits || left.key.localeCompare(right.key)
          )
        : groups,
    totalCredits,
  });
}

// A group can hold credits with nothing to divide them by — a message whose id
// was never indexed, a bucket the count agg saw as empty. Report 0 rather than a
// non-finite average.
export function avgCreditsPerUnit(credits: number, count: number): number {
  return count > 0 ? credits / count : 0;
}
