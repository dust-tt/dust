import type {
  AnalyticsScopeFilter,
  AwuUsageAnalyticsResponse,
} from "@app/lib/api/analytics/awu_usage_analytics";
import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import type { GetApiKeysUsageResponseBody } from "@app/lib/api/credits/api_keys_usage";
import type { GetMembersUsageResponseBody } from "@app/lib/api/credits/members_usage";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type {
  AwuPoolCurrentCycleResponseBody,
  AwuPoolCycleHistoryResponseBody,
  AwuPoolSummaryResponseBody,
} from "@app/types/api/credits/awu_pool_summary";
import type { GetAwuTopUpsHistoryResponseBody } from "@app/types/api/credits/top_ups_history";
import type { PokeListCreditsResponseBody } from "@app/types/api/poke/credits";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import type { Fetcher } from "swr";

export type PokeCreditsData = {
  rows: PokeListCreditsResponseBody["rows"];
  excessCreditsLast30DaysMicroUsd: number;
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
  filter,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: "usage_type" | "agent" | "user" | "origin" | "api_key" | "model";
  groupByCount?: number;
  granularity?: "day" | "week" | "month";
  days?: number;
  filter?: AnalyticsScopeFilter;
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
  if (filter && Object.keys(filter).length > 0) {
    queryParams.set("filter", JSON.stringify(filter));
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
    `/api/poke/workspaces/${owner.sId}/credits/awu-pool-summary`,
    fetcherFn,
    { disabled }
  );

  return {
    awuPoolSummary: data ?? null,
    isAwuPoolSummaryLoading: !error && !data && !disabled,
    isAwuPoolSummaryError: error,
    isAwuPoolSummaryValidating: isValidating,
    mutateAwuPoolSummary: mutate,
  };
}

export function usePokeAwuPoolCurrentCycle({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<AwuPoolCurrentCycleResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits/awu-pool-current-cycle`,
    fetcherFn,
    { disabled }
  );

  return {
    awuPoolCurrentCycle: data ?? null,
    isAwuPoolCurrentCycleLoading: !error && !data && !disabled,
    isAwuPoolCurrentCycleError: error,
    isAwuPoolCurrentCycleValidating: isValidating,
    mutateAwuPoolCurrentCycle: mutate,
  };
}

export function usePokeAwuPoolCycleHistory({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<AwuPoolCycleHistoryResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits/awu-pool-cycle-history`,
    fetcherFn,
    { disabled }
  );

  return {
    cycleBreakdown: data?.cycleBreakdown ?? emptyArray(),
    excessCycleBreakdown: data?.excessCycleBreakdown ?? emptyArray(),
    isAwuPoolCycleHistoryLoading: !error && !data && !disabled,
    isAwuPoolCycleHistoryError: error,
    isAwuPoolCycleHistoryValidating: isValidating,
    mutateAwuPoolCycleHistory: mutate,
  };
}

export function usePokeTopUpsHistory({
  owner,
  disabled,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetAwuTopUpsHistoryResponseBody> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits/top-ups`,
    fetcherFn,
    { disabled }
  );

  return {
    topUps: data?.topUps ?? emptyArray(),
    isTopUpsHistoryLoading: !error && !data && !disabled,
    isTopUpsHistoryError: error,
    isTopUpsHistoryValidating: isValidating,
    mutateTopUpsHistory: mutate,
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
  seatType,
  creditState,
  groupId,
}: PokeConditionalFetchProps & {
  pageIndex: number;
  pageSize: number;
  search?: string;
  orderColumn?:
    | "name"
    | "email"
    | "consumedAwuCredits"
    | "consumedFromPoolAwuCredits"
    | "seatType"
    | "creditState"
    | "seatUsage"
    | "premiumMessageUsage"
    | "fairUse";
  orderDirection?: "asc" | "desc";
  seatType?: MembershipSeatType;
  creditState?: UserCreditState;
  groupId?: string;
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
  if (seatType) {
    params.set("seatType", seatType);
  }
  if (creditState) {
    params.set("creditState", creditState);
  }
  if (groupId) {
    params.set("groupId", groupId);
  }
  if (orderDirection) {
    params.set("orderDirection", orderDirection);
  }

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits/members-usage?${params.toString()}`,
    fetcherFn,
    { disabled, revalidateOnFocus: false, keepPreviousData: true }
  );

  return {
    members: data?.members ?? emptyArray(),
    totalMembers: data?.total ?? 0,
    creditsResetAt: data?.creditsResetAt ?? null,
    isMembersUsageLoading: !error && !data && !disabled,
    isMembersUsageError: error,
    isMembersUsageValidating: isValidating,
    mutateMembersUsage: mutate,
  };
}

export function usePokeApiKeysUsage({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetApiKeysUsageResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits/api-keys-usage`,
    fetcherFn,
    { disabled, revalidateOnFocus: false }
  );

  return {
    apiKeys: data?.keys ?? emptyArray(),
    isApiKeysUsageLoading: !error && !data && !disabled,
    isApiKeysUsageError: error,
    mutateApiKeysUsage: mutate,
  };
}

const EMPTY_SEAT_PLANS: SeatPlanResponseBody = {};

export function usePokeSeatPlan({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const seatPlanFetcher: Fetcher<SeatPlanResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits/seats-plan`,
    seatPlanFetcher,
    { disabled }
  );

  return {
    seatPlans: data ?? EMPTY_SEAT_PLANS,
    isSeatPlanLoading: !error && !data && !disabled,
    isSeatPlanError: error,
  };
}
