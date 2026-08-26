import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import { contextOriginFilter } from "@app/lib/api/assistant/observability/context_origin";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";
import type { WithAuth } from "@app/types/shared/typescipt_utils";
import type { estypes } from "@elastic/elasticsearch";

export type AnalystFilterInput = {
  source?: string;
  agentIds?: string[];
  userIds?: string[];
  agentTagIds?: string[];
  modelIds?: string[];
};

export type AnalystScope = {
  startDate: string;
  endDate: string;
  timezone: string;
  filter: ConsumptionScopeFilter;
  extraFilters: estypes.QueryDslQueryContainer[];
};

// Expects an end-of-day timestamp (e.g. moment's `endOf("day")`, ending in
// `.999Z`), as produced by the tool's time window resolution. Adding 1ms
// rounds it up to the start of the next day, the half-open upper bound
// `buildConsumptionScopeQuery` expects.
function toExclusiveEndDate(inclusiveEndDate: string): string {
  return new Date(Date.parse(inclusiveEndDate) + 1).toISOString();
}

export interface BuildAnalystScopeParams extends AnalystFilterInput {
  startDate: string;
  endDate: string;
  timezone: string;
}

export function buildAnalystScope({
  startDate,
  endDate,
  timezone,
  source,
  agentIds,
  userIds,
  agentTagIds,
  modelIds,
}: BuildAnalystScopeParams): AnalystScope {
  const filter: ConsumptionScopeFilter = {};
  if (agentIds && agentIds.length > 0) {
    filter.agents = agentIds;
  }
  if (userIds && userIds.length > 0) {
    filter.users = userIds;
  }
  if (modelIds && modelIds.length > 0) {
    filter.models = modelIds;
  }

  const extraFilters: estypes.QueryDslQueryContainer[] = [];
  if (agentTagIds && agentTagIds.length > 0) {
    // There is no scope dimension for tags, so this is not expressible via
    // `filter` above.
    extraFilters.push(
      agentTagIds.length === 1
        ? { term: { "agent.tag_ids": agentTagIds[0] } }
        : { terms: { "agent.tag_ids": agentTagIds } }
    );
  }
  if (source !== undefined) {
    extraFilters.push(...contextOriginFilter(source));
  }

  return {
    startDate,
    endDate: toExclusiveEndDate(endDate),
    timezone,
    filter,
    extraFilters,
  };
}

export interface AnalystQueryParams {
  scope: AnalystScope;
  extra?: estypes.QueryDslQueryContainer[];
}

export function analystQuery({
  auth,
  scope,
  extra = [],
}: WithAuth<AnalystQueryParams>): estypes.QueryDslQueryContainer {
  return buildConsumptionScopeQuery({
    auth,
    startDate: scope.startDate,
    endDate: scope.endDate,
    filter: scope.filter,
    extraFilters: [...scope.extraFilters, ...extra],
  });
}
