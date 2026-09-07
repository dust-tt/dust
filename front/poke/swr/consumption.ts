import { EMPTY_FACET_OPTIONS } from "@app/components/workspace/analytics/usageFilter";
import type { UseConsumptionFacetsParams } from "@app/hooks/useConsumptionFacets";
import { toConsumptionFacetOptions } from "@app/hooks/useConsumptionFacets";
import type { UseConsumptionOverviewParams } from "@app/hooks/useConsumptionOverview";
import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { UseConsumptionTimeseriesParams } from "@app/hooks/useConsumptionTimeseries";
import type {
  ConsumptionTopDimension,
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
  GetConsumptionTimeseriesResponse,
} from "@app/lib/api/analytics/consumption/timeseries";
import { emptyArray } from "@app/lib/swr/swr";
import { useMemo } from "react";

const CONSUMPTION_TOP_ENDPOINTS = {
  agent: "top-agents",
  user: "top-users",
  group: "top-groups",
  model: "top-models",
  reasoning_effort: "top-reasoning-efforts",
  tool: "top-tools",
  skill: "top-skills",
  source: "top-sources",
  api_key: "top-api-keys",
} as const satisfies Record<ConsumptionTopDimension, string>;

function toPokeConsumptionTopRows(
  data: ConsumptionTopResponse,
  workspaceId: string
): ConsumptionTopRow[] {
  const rows = toConsumptionTopRows(data);
  if ("agents" in data) {
    return rows.map((row) => ({
      ...row,
      detailsHref: row.modelId
        ? `/poke/${workspaceId}/assistants/${row.id}`
        : undefined,
    }));
  }
  if ("groups" in data) {
    return rows.map((row) => ({
      ...row,
      detailsHref:
        row.name !== row.id
          ? `/poke/${workspaceId}/groups/${row.id}`
          : undefined,
    }));
  }
  if ("skills" in data) {
    return rows.map((row) => ({
      ...row,
      detailsHref:
        row.name !== row.id
          ? `/poke/${workspaceId}/skills/${row.id}`
          : undefined,
    }));
  }

  return rows;
}

type ConsumptionTimeseriesBody = ConsumptionBody & {
  mode: ConsumptionTimeseriesMode;
  breakdownBy?: ConsumptionBreakdownDimension;
  breakdownCount?: number;
};

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
}: UseConsumptionTimeseriesParams) {
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
    GetConsumptionTimeseriesResponse
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
}: UseConsumptionTopParams) {
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
    ConsumptionTopResponse
  >({ url, body, disabled });

  const rows = useMemo(
    () =>
      data
        ? toPokeConsumptionTopRows(data, workspaceId)
        : emptyArray<ConsumptionTopRow>(),
    [data, workspaceId]
  );

  return {
    rows,
    totalCredits: data?.totalCredits ?? 0,
    totalActiveMembers:
      data && "totalActiveMembers" in data ? data.totalActiveMembers : 0,
    totalCount: data?.totalCount ?? 0,
    hasMore: data?.hasMore ?? false,
    isTopLoading: !error && isLoading,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
