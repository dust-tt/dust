import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type {
  ConsumptionFacetOptions,
  UseConsumptionFacetsParams,
} from "@app/hooks/useConsumptionFacets";
import { toConsumptionFacetOptions } from "@app/hooks/useConsumptionFacets";
import type { UseConsumptionOverviewParams } from "@app/hooks/useConsumptionOverview";
import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { UseConsumptionTimeseriesParams } from "@app/hooks/useConsumptionTimeseries";
import type {
  ConsumptionTopResponse,
  ConsumptionTopRow,
  UseConsumptionTopParams,
} from "@app/hooks/useConsumptionTop";
import { toConsumptionTopRows } from "@app/hooks/useConsumptionTop";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type {
  ConsumptionBody,
  ConsumptionTopBody,
} from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionBreakdownDimension,
  ConsumptionTimeseriesMode,
  GetPokeConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";
import type { GetConsumptionTopAutomationsResponse } from "@app/lib/api/analytics/consumption/top_automations";
import { emptyArray } from "@app/lib/swr/swr";
import { useMemo } from "react";

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

const CONSUMPTION_TOP_ENDPOINTS = {
  agent: "top-agents",
  user: "top-users",
  group: "top-groups",
  model: "top-models",
  tool: "top-tools",
  skill: "top-skills",
  source: "top-sources",
  api_key: "top-api-keys",
  automation: "top-automations",
} as const satisfies Record<ConsumptionDimension, string>;

type ConsumptionTimeseriesBody = ConsumptionBody & {
  mode: ConsumptionTimeseriesMode;
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
};

interface UsePokeConsumptionTimeseriesParams
  extends Omit<UseConsumptionTimeseriesParams, "breakdownBy"> {
  breakdownBy?: ConsumptionBreakdownDimension;
}

export interface UsePokeConsumptionTopParams
  extends Omit<UseConsumptionTopParams, "dimension"> {
  dimension: ConsumptionDimension;
}

type PokeConsumptionTopResponse =
  | ConsumptionTopResponse
  | GetConsumptionTopAutomationsResponse;

function toPokeConsumptionTopRows(
  data: PokeConsumptionTopResponse
): ConsumptionTopRow[] {
  if ("automations" in data) {
    return data.automations.map((row) => ({
      id: row.triggerId,
      name: row.name,
      pictureUrl: null,
      description: row.agentName ? `Agent: ${row.agentName}` : null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      runCount: row.runCount,
      avgCredits: row.avgCreditsPerRun,
      previousCredits: row.previousCredits,
    }));
  }

  return toConsumptionTopRows(data);
}

export function usePokeConsumptionOverview({
  workspaceId,
  period,
  filter,
  disabled,
}: UseConsumptionOverviewParams) {
  const url = `/api/poke/workspaces/${workspaceId}/analytics/consumption/overview`;
  const body: ConsumptionBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    ConsumptionBody,
    GetConsumptionOverviewResponse
  >({ url, body, disabled });

  return {
    overview: data ?? null,
    isOverviewLoading: isLoading,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}

export function usePokeConsumptionFacets({
  workspaceId,
  period,
  filter,
  disabled,
}: UseConsumptionFacetsParams) {
  const url = `/api/poke/workspaces/${workspaceId}/analytics/consumption/facets`;
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
  };
}

export function usePokeConsumptionTimeseries({
  workspaceId,
  period,
  mode,
  breakdownBy,
  breakdownCount,
  filter,
  disabled,
}: UsePokeConsumptionTimeseriesParams) {
  const url = `/api/poke/workspaces/${workspaceId}/analytics/consumption/timeseries`;
  const body: ConsumptionTimeseriesBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    mode,
    breakdownBy,
    breakdownCount,
  };

  const { data, error, isValidating } = useConsumptionQuery<
    ConsumptionTimeseriesBody,
    GetPokeConsumptionTimeseriesResponse
  >({ url, body, disabled });

  return {
    timeseries: data ?? null,
    isTimeseriesLoading: !error && !data && !disabled,
    isTimeseriesError: error,
    isTimeseriesValidating: isValidating,
  };
}

export function usePokeConsumptionTop({
  workspaceId,
  dimension,
  period,
  limit,
  offset = 0,
  search,
  filter,
  sortOrder = "desc",
  disabled,
}: UsePokeConsumptionTopParams) {
  const url = `/api/poke/workspaces/${workspaceId}/analytics/consumption/${CONSUMPTION_TOP_ENDPOINTS[dimension]}`;
  const body: ConsumptionTopBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    limit,
    offset,
    search: search?.trim(),
    sortOrder,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    ConsumptionTopBody,
    PokeConsumptionTopResponse
  >({ url, body, disabled });

  const rows = useMemo(
    () =>
      data ? toPokeConsumptionTopRows(data) : emptyArray<ConsumptionTopRow>(),
    [data]
  );

  return {
    rows,
    totalCredits: data?.totalCredits ?? 0,
    totalCount: data?.totalCount ?? 0,
    hasMore: data?.hasMore ?? false,
    isTopLoading: !error && isLoading,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
