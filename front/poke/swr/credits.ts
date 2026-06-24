import type { AwuUsageAnalyticsResponse } from "@app/lib/api/analytics/awu_usage_analytics";
import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { AwuPoolSummaryResponseBody } from "@app/types/api/credits/awu_pool_summary";
import type { PokeListCreditsResponseBody } from "@app/types/api/poke/credits";
import type { Fetcher } from "swr";

export type PokeCreditsData = {
  rows: PokeListCreditsResponseBody["rows"];
  excessCreditsLast30DaysMicroUsd: number;
  hasMetronome: boolean;
};

export function usePokeCredits({ disabled, owner }: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const creditsFetcher: Fetcher<PokeListCreditsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits`,
    creditsFetcher,
    { disabled }
  );

  const creditsData: PokeCreditsData = {
    rows: data?.rows ?? emptyArray(),
    excessCreditsLast30DaysMicroUsd: data?.excessCreditsLast30DaysMicroUsd ?? 0,
    hasMetronome: data?.hasMetronome ?? false,
  };

  return {
    data: creditsData,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeProgrammaticCost({
  owner,
  groupBy,
  groupByCount,
  selectedPeriod,
  billingCycleStartDay,
  filter,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: GroupByType;
  groupByCount?: number;
  selectedPeriod?: string;
  billingCycleStartDay: number;
  filter?: Partial<Record<GroupByType, string[]>>;
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetWorkspaceProgrammaticCostResponse> = fetcher;

  const queryParams = new URLSearchParams();
  queryParams.set("billingCycleStartDay", billingCycleStartDay.toString());
  if (selectedPeriod) {
    queryParams.set("selectedPeriod", selectedPeriod);
  }
  if (groupBy) {
    queryParams.set("groupBy", groupBy);
  }
  if (groupByCount !== undefined) {
    queryParams.set("groupByCount", groupByCount.toString());
  }
  if (filter && Object.keys(filter).length > 0) {
    queryParams.set("filter", JSON.stringify(filter));
  }
  const queryString = queryParams.toString();
  const key = `/api/poke/workspaces/${owner.sId}/analytics/programmatic-cost?${queryString}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    programmaticCostData: data,
    isProgrammaticCostLoading: !error && !data && !disabled,
    isProgrammaticCostError: error,
    isProgrammaticCostValidating: isValidating,
  };
}

export function usePokeAwuUsageFromAnalytics({
  owner,
  groupBy,
  groupByCount,
  granularity,
  days,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: "usage_type" | "agent" | "user" | "origin";
  groupByCount?: number;
  granularity?: "day" | "week" | "month";
  days?: number;
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<AwuUsageAnalyticsResponse> = fetcher;

  const queryParams = new URLSearchParams();
  if (groupBy) {
    queryParams.set("groupBy", groupBy);
  }
  if (groupByCount !== undefined) {
    queryParams.set("groupByCount", groupByCount.toString());
  }
  if (granularity) {
    queryParams.set("granularity", granularity);
  }
  if (days !== undefined) {
    queryParams.set("days", days.toString());
  }
  const queryString = queryParams.toString();
  const key = `/api/poke/workspaces/${owner.sId}/analytics/awu-usage-analytics?${queryString}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    awuUsageData: data,
    isAwuUsageLoading: !error && !data && !disabled,
    isAwuUsageError: error,
    isAwuUsageValidating: isValidating,
  };
}

export function usePokeAwuPoolSummary({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<AwuPoolSummaryResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/poke/workspaces/${owner.sId}/credits/awu-pool-summary`,
    fetcherFn
  );

  return {
    awuPoolSummary: data ?? null,
    isAwuPoolSummaryLoading: !error && !data && !disabled,
    isAwuPoolSummaryError: error,
    isAwuPoolSummaryValidating: isValidating,
    mutateAwuPoolSummary: mutate,
  };
}

export function usePokeMembersUsage({
  owner,
  disabled,
  pageIndex,
  pageSize,
  search,
  orderColumn,
  orderDirection,
}: PokeConditionalFetchProps & {
  pageIndex: number;
  pageSize: number;
  search?: string;
  orderColumn?: "name" | "email";
  orderDirection?: "asc" | "desc";
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetMembersUsageResponseBody> = fetcher;

  const params = new URLSearchParams({
    offset: String(pageIndex * pageSize),
    limit: String(pageSize),
  });
  if (search && search.trim().length > 0) {
    params.set("search", search.trim());
  }
  if (orderColumn) {
    params.set("orderColumn", orderColumn);
  }
  if (orderDirection) {
    params.set("orderDirection", orderDirection);
  }

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/poke/workspaces/${owner.sId}/credits/members-usage?${params.toString()}`,
    fetcherFn,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  return {
    members: data?.members ?? emptyArray(),
    totalMembers: data?.total ?? 0,
    isMembersUsageLoading: !error && !data && !disabled,
    isMembersUsageError: error,
    isMembersUsageValidating: isValidating,
    mutateMembersUsage: mutate,
  };
}
