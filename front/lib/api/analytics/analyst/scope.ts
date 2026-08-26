import {
  buildConsumptionScopeQuery,
  exclusiveEndDate,
} from "@app/lib/api/analytics/consumption/scope";
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
  filter: ConsumptionScopeFilter;
  extraFilters: estypes.QueryDslQueryContainer[];
};

export interface BuildAnalystScopeParams extends AnalystFilterInput {
  startDate: string;
  endDate: string;
}

export function buildAnalystScope({
  startDate,
  endDate,
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
    endDate: exclusiveEndDate(endDate),
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
