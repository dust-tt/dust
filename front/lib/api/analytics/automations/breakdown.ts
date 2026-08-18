import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
  CREDIT_MICRO_FIELD,
  TRIGGER_ID_FIELD,
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
import type { estypes } from "@elastic/elasticsearch";

// The dimensions a trigger's credits can be attributed to, ranked against each
// other to find the single biggest destination.
const CREDIT_DESTINATION_DIMENSIONS = ["tool", "model", "skill"] as const;
type CreditDestinationDimension =
  (typeof CREDIT_DESTINATION_DIMENSIONS)[number];

export type AutomationTriggerCreditDestination = {
  dimension: CreditDestinationDimension;
  key: string;
  name: string;
  icon: string | null;
  credits: number;
  // Share of this trigger's own credits over the period, not the workspace's.
  share: number;
};

export type AutomationTriggerBreakdown = {
  period: ConsumptionPeriod;
  creditDestination: AutomationTriggerCreditDestination | null;
};

export type GetAutomationTriggerBreakdownResponse = AutomationTriggerBreakdown;

const CREDIT_AGG = "credit_micro";
const TOTAL_CREDIT_AGG = "total_credit_micro";
const TOOL_AGG = "by_tool";
const MODEL_AGG = "by_model";
const SKILL_AGG = "by_skill";

type DestinationBucket = {
  key: string;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
};

type DestinationAggs = {
  [TOOL_AGG]?: estypes.AggregationsMultiBucketAggregateBase<DestinationBucket>;
  [MODEL_AGG]?: estypes.AggregationsMultiBucketAggregateBase<DestinationBucket>;
  [SKILL_AGG]?: estypes.AggregationsMultiBucketAggregateBase<DestinationBucket>;
  [TOTAL_CREDIT_AGG]?: estypes.AggregationsSumAggregate;
};

function topBucketAggregation(
  dimension: CreditDestinationDimension
): estypes.AggregationsAggregationContainer {
  return {
    terms: {
      field: CONSUMPTION_DIMENSION_FIELDS[dimension],
      size: 1,
      order: { [CREDIT_AGG]: "desc" },
    },
    aggs: { [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } } },
  };
}

/**
 * The single biggest destination of a trigger's credits over a period, picked
 * across the tool/model/skill dimensions by whichever has the largest top
 * bucket. Distinct from the consumption attribution table's per-dimension
 * ranking: this only ever surfaces one winner, scoped to one trigger.
 */
export async function fetchAutomationTriggerBreakdown(
  auth: Authenticator,
  { triggerId, period }: { triggerId: string; period: ConsumptionPeriod }
): Promise<Result<AutomationTriggerBreakdown, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    extraFilters: [{ term: { [TRIGGER_ID_FIELD]: triggerId } }],
  });

  const result = await searchConsumptionAnalytics<never, DestinationAggs>(
    query,
    {
      aggregations: {
        [TOOL_AGG]: topBucketAggregation("tool"),
        [MODEL_AGG]: topBucketAggregation("model"),
        [SKILL_AGG]: topBucketAggregation("skill"),
        [TOTAL_CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
      },
      size: 0,
    }
  );
  if (result.isErr()) {
    return result;
  }

  const aggs = result.value.aggregations;
  const totalCredits = microCreditsToCredits(
    aggs?.[TOTAL_CREDIT_AGG]?.value ?? 0
  );

  const candidates = (
    [
      [TOOL_AGG, "tool"],
      [MODEL_AGG, "model"],
      [SKILL_AGG, "skill"],
    ] as const
  ).flatMap(([aggName, dimension]) => {
    const bucket = bucketsToArray<DestinationBucket>(
      aggs?.[aggName]?.buckets
    )[0];
    if (!bucket) {
      return [];
    }
    return [
      {
        dimension,
        key: String(bucket.key),
        credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
      },
    ];
  });

  const top = candidates.sort((a, b) => b.credits - a.credits)[0];
  if (!top || top.credits === 0) {
    return new Ok({ period, creditDestination: null });
  }

  const labels = await resolveDimensionLabels(auth, top.dimension, [top.key]);
  const label = labels.get(top.key);

  return new Ok({
    period,
    creditDestination: {
      dimension: top.dimension,
      key: top.key,
      name: label?.name ?? top.key,
      icon: label?.icon ?? null,
      credits: top.credits,
      share: totalCredits > 0 ? top.credits / totalCredits : 0,
    },
  });
}
