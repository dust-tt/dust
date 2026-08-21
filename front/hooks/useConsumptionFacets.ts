import type {
  UsageFilterAgentOption,
  UsageFilterApiKeyOption,
  UsageFilterGroupOption,
  UsageFilterMemberOption,
  UsageFilterModelOption,
  UsageFilterOptionsByCategory,
  UsageFilterSkillOption,
  UsageFilterSourceOption,
  UsageFilterToolOption,
} from "@app/components/workspace/analytics/usageFilter";
import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { isConnectorProvider } from "@app/types/data_source";
import { useMemo } from "react";

export type ConsumptionFacetOptions = UsageFilterOptionsByCategory;

const EMPTY_FACET_OPTIONS: ConsumptionFacetOptions = {
  agent: [],
  member: [],
  group: [],
  model: [],
  tool: [],
  skill: [],
  source: [],
  api_key: [],
};

export interface UseConsumptionFacetsParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}

function baseOption(facet: {
  value: string;
  label: string;
  disabled: boolean;
}) {
  return {
    id: facet.value,
    name: facet.label,
    disabled: facet.disabled,
  };
}

export function toConsumptionFacetOptions(
  data: GetConsumptionFacetsResponse
): ConsumptionFacetOptions {
  return {
    agent: data.facets.agent.map<UsageFilterAgentOption>((facet) => ({
      ...baseOption(facet),
      kind: "agent",
      image: facet.pictureUrl,
      scope: facet.scope,
    })),
    member: data.facets.user.map<UsageFilterMemberOption>((facet) => ({
      ...baseOption(facet),
      kind: "member",
      image: facet.pictureUrl,
    })),
    group: data.facets.group.map<UsageFilterGroupOption>((facet) => ({
      ...baseOption(facet),
      kind: "group",
    })),
    model: data.facets.model.map<UsageFilterModelOption>((facet) => ({
      ...baseOption(facet),
      kind: "model",
      lab: facet.maker,
      tier: facet.tier ?? undefined,
    })),
    tool: data.facets.tool.map<UsageFilterToolOption>((facet) => ({
      ...baseOption(facet),
      kind: "tool",
      icon: facet.icon ?? null,
    })),
    skill: data.facets.skill.map<UsageFilterSkillOption>((facet) => ({
      ...baseOption(facet),
      kind: "skill",
      icon: facet.icon ?? null,
    })),
    source: data.facets.source.map<UsageFilterSourceOption>((facet) => ({
      ...baseOption(facet),
      kind: "source",
      connectorProvider: isConnectorProvider(facet.value)
        ? facet.value
        : undefined,
    })),
    api_key: data.facets.api_key.map<UsageFilterApiKeyOption>((facet) => ({
      ...baseOption(facet),
      kind: "api_key",
    })),
  };
}

export function useConsumptionFacets({
  workspaceId,
  period,
  filter,
  disabled,
}: UseConsumptionFacetsParams) {
  const url = `/api/w/${workspaceId}/analytics/consumption/facets`;
  const body: ConsumptionBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };

  const { data, error, isValidating } = useConsumptionQuery<
    ConsumptionBody,
    GetConsumptionFacetsResponse
  >({ url, body, disabled });

  const options = useMemo(
    () => (data ? toConsumptionFacetOptions(data) : EMPTY_FACET_OPTIONS),
    [data]
  );

  return {
    options,
    isFacetsLoading: !error && !data && !disabled,
    isFacetsError: error,
    isFacetsValidating: isValidating,
    // SWR keeps the previous response while a new one is in flight, so
    // `options` only covers the requested period once this is true.
    isFacetsSettled: !disabled && !isValidating && data !== undefined,
  };
}
