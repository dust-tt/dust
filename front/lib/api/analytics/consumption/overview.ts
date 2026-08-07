import type {
  ConsumptionPeriod,
  ConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/period";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  COMPLETED_AT_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type ConsumptionOverview = {
  period: ConsumptionPeriod;
  members: {
    active: number;
    total: number;
  };
  lastRecordAt: string | null;
};

export type GetConsumptionOverviewResponse = ConsumptionOverview;

type OverviewAggs = {
  active_members?: estypes.AggregationsCardinalityAggregate;
  last_completed_at?: estypes.AggregationsMaxAggregate;
};

function lastRecordAtFromAgg(
  agg: estypes.AggregationsMaxAggregate | undefined
): string | null {
  if (!agg || agg.value === null || agg.value === undefined) {
    return null;
  }
  return agg.value_as_string ?? new Date(agg.value).toISOString();
}

export async function fetchConsumptionOverview(
  auth: Authenticator,
  {
    periodInput,
    filter,
  }: { periodInput: ConsumptionPeriodInput; filter?: ConsumptionScopeFilter }
): Promise<Result<ConsumptionOverview, ElasticsearchError>> {
  const workspace = auth.getNonNullableWorkspace();
  const period = await resolveConsumptionPeriod(auth, periodInput);

  const query = buildConsumptionScopeQuery({
    auth: auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const [searchResult, totalMembers] = await Promise.all([
    searchConsumptionAnalytics<never, OverviewAggs>(query, {
      aggregations: {
        active_members: { cardinality: { field: "user.id" } },
        last_completed_at: { max: { field: COMPLETED_AT_FIELD } },
      },
      size: 0,
    }),
    MembershipResource.countActiveMembersForWorkspace({ workspace }),
  ]);

  if (searchResult.isErr()) {
    return searchResult;
  }

  const aggregations = searchResult.value.aggregations;

  return new Ok({
    period,
    members: {
      active: Math.round(aggregations?.active_members?.value ?? 0),
      total: totalMembers,
    },
    lastRecordAt: lastRecordAtFromAgg(aggregations?.last_completed_at),
  });
}
