import type {
  AwuUsageGroupByType,
  GetAwuUsageResponse,
} from "@app/lib/api/analytics/awu_usage";
import type {
  GetMetronomeUsageResponse,
  MetronomeUsageGroupByType,
} from "@app/lib/api/analytics/metronome_usage";
import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import type { WindowSize } from "@app/lib/api/analytics/time_utils";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import type { PokeListCreditsResponseBody } from "@app/lib/api/poke/credits";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { AwuPoolSummaryResponseBody } from "@app/types/api/credits/awu_pool_summary";
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

export function usePokeMetronomeUsage({
  owner,
  groupBy,
  groupByCount,
  selectedPeriod,
  billingCycleStartDay,
  windowSize,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: MetronomeUsageGroupByType;
  groupByCount?: number;
  selectedPeriod?: string;
  billingCycleStartDay: number;
  windowSize?: WindowSize;
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetMetronomeUsageResponse> = fetcher;

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
  if (windowSize) {
    queryParams.set("windowSize", windowSize);
  }
  const queryString = queryParams.toString();
  const key = `/api/poke/workspaces/${owner.sId}/analytics/metronome-usage?${queryString}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    metronomeUsageData: data,
    isMetronomeUsageLoading: !error && !data && !disabled,
    isMetronomeUsageError: error,
    isMetronomeUsageValidating: isValidating,
  };
}

export function usePokeAwuUsage({
  owner,
  groupBy,
  groupByCount,
  selectedPeriod,
  billingCycleStartDay,
  windowSize,
  includeFreeUsage,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: AwuUsageGroupByType;
  groupByCount?: number;
  selectedPeriod?: string;
  billingCycleStartDay: number;
  windowSize?: WindowSize;
  includeFreeUsage?: boolean;
}) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetAwuUsageResponse> = fetcher;

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
  if (windowSize) {
    queryParams.set("windowSize", windowSize);
  }
  if (includeFreeUsage) {
    queryParams.set("includeFreeUsage", "true");
  }
  const queryString = queryParams.toString();
  const key = `/api/poke/workspaces/${owner.sId}/analytics/awu-usage?${queryString}`;

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
