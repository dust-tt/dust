import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type {
  ConsumptionPeriod,
  ConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/period";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import { getAwuPoolSummary } from "@app/lib/api/credits/awu_pool_summary";
import { computeCreditUsageStatus } from "@app/lib/api/credits/usage_status";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { CreditUsageStatus } from "@app/types/api/credits/usage_status";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type ConsumptionOverviewTopAgent = {
  agentId: string;
  name: string;
  credits: number;
};

export type ConsumptionOverviewCreditUsage = {
  capCredits: number;
  status: CreditUsageStatus;
};

export type ConsumptionOverview = {
  period: ConsumptionPeriod;
  members: {
    active: number;
    total: number;
  };
  messageCount?: number;
  lastRecordAt: string | null;
  totalCredits: number;
  topAgent: ConsumptionOverviewTopAgent | null;
  creditUsage: ConsumptionOverviewCreditUsage | null;
};

export type GetConsumptionOverviewResponse = ConsumptionOverview;

const AGENT_CREDIT_AGG = "credit_micro";

type TopAgentBucket = {
  key: string;
  [AGENT_CREDIT_AGG]?: estypes.AggregationsSumAggregate;
};

type OverviewAggs = {
  active_members?: estypes.AggregationsCardinalityAggregate;
  message_count?: estypes.AggregationsCardinalityAggregate;
  last_completed_at?: estypes.AggregationsMaxAggregate;
  total_credit_micro?: estypes.AggregationsSumAggregate;
  top_agent?: estypes.AggregationsMultiBucketAggregateBase<TopAgentBucket>;
};

function lastRecordAtFromAgg(
  agg: estypes.AggregationsMaxAggregate | undefined
): string | null {
  if (!agg || agg.value === null || agg.value === undefined) {
    return null;
  }
  return agg.value_as_string ?? new Date(agg.value).toISOString();
}

async function fetchPoolCapCredits(
  auth: Authenticator,
  periodInput: ConsumptionPeriodInput
): Promise<number | null> {
  if (periodInput.kind !== "cycle") {
    return null;
  }

  const poolResult = await getAwuPoolSummary(auth);
  if (poolResult.isErr()) {
    return null;
  }

  return poolResult.value.totalActiveCredits;
}

function buildCreditUsage({
  capCredits,
  period,
  totalCredits,
  nowMs,
}: {
  capCredits: number | null;
  period: ConsumptionPeriod;
  totalCredits: number;
  nowMs: number;
}): ConsumptionOverviewCreditUsage | null {
  if (capCredits === null) {
    return null;
  }

  const status = computeCreditUsageStatus({
    consumedAwuCredits: totalCredits,
    limitAwuCredits: capCredits,
    billingCycle: {
      cycleStart: new Date(period.startDate),
      cycleEnd: new Date(period.endDate),
    },
    nowMs,
  });

  return status ? { capCredits, status } : null;
}

async function topAgentFromAgg(
  auth: Authenticator,
  agg: estypes.AggregationsMultiBucketAggregateBase<TopAgentBucket> | undefined
): Promise<ConsumptionOverviewTopAgent | null> {
  const [bucket] = bucketsToArray<TopAgentBucket>(agg?.buckets);
  if (!bucket) {
    return null;
  }

  const agentId = String(bucket.key);
  const labels = await resolveDimensionLabels(auth, "agent", [agentId]);

  return {
    agentId,
    name: labels.get(agentId)?.name ?? agentId,
    credits: microCreditsToCredits(bucket[AGENT_CREDIT_AGG]?.value ?? 0),
  };
}

export async function fetchConsumptionOverview(
  auth: Authenticator,
  {
    periodInput,
    filter,
    includeWorkspaceContext = true,
  }: {
    periodInput: ConsumptionPeriodInput;
    filter?: ConsumptionScopeFilter;
    includeWorkspaceContext?: boolean;
  }
): Promise<Result<ConsumptionOverview, ElasticsearchError>> {
  const workspace = auth.getNonNullableWorkspace();
  const period = await resolveConsumptionPeriod(auth, periodInput);

  const query = buildConsumptionScopeQuery({
    auth: auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const [searchResult, totalMembers, capCredits] = await Promise.all([
    searchConsumptionAnalytics<never, OverviewAggs>(query, {
      aggregations: {
        active_members: { cardinality: { field: "user.id" } },
        message_count: {
          cardinality: {
            field: AGENT_MESSAGE_ID_FIELD,
            precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
          },
        },
        last_completed_at: { max: { field: COMPLETED_AT_FIELD } },
        total_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
        top_agent: {
          terms: {
            field: CONSUMPTION_DIMENSION_FIELDS.agent,
            size: 1,
            order: { [AGENT_CREDIT_AGG]: "desc" },
          },
          aggs: {
            [AGENT_CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          },
        },
      },
      size: 0,
    }),
    includeWorkspaceContext
      ? MembershipResource.countActiveMembersForWorkspace({ workspace })
      : Promise.resolve(0),
    includeWorkspaceContext
      ? fetchPoolCapCredits(auth, periodInput)
      : Promise.resolve(null),
  ]);

  if (searchResult.isErr()) {
    return searchResult;
  }

  const aggregations = searchResult.value.aggregations;
  const totalCredits = microCreditsToCredits(
    aggregations?.total_credit_micro?.value ?? 0
  );
  const activeMembers = Math.round(aggregations?.active_members?.value ?? 0);

  return new Ok({
    period,
    members: {
      active: activeMembers,
      total: includeWorkspaceContext ? totalMembers : activeMembers,
    },
    messageCount: Math.round(aggregations?.message_count?.value ?? 0),
    lastRecordAt: lastRecordAtFromAgg(aggregations?.last_completed_at),
    totalCredits,
    topAgent: await topAgentFromAgg(auth, aggregations?.top_agent),
    creditUsage: buildCreditUsage({
      capCredits,
      period,
      totalCredits,
      nowMs: Date.now(),
    }),
  });
}
