import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import { useRegionContextSafe } from "@app/lib/auth/RegionContext";
import { getApiBaseUrl } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetNoWorkspaceAuthContextResponseType } from "@app/pages/api/auth-context";
import type { GetWorkspaceResponseBody } from "@app/pages/api/w/[wId]";
import type { GetWorkspaceAnalyticsOverviewResponse } from "@app/pages/api/w/[wId]/analytics/overview";
import type { GetWorkspaceContextOriginResponse } from "@app/pages/api/w/[wId]/analytics/source";
import type { GetWorkspaceToolUsageResponse } from "@app/pages/api/w/[wId]/analytics/tool-usage";
import type { GetWorkspaceToolsResponse } from "@app/pages/api/w/[wId]/analytics/tools";
import type { GetWorkspaceTopAgentsResponse } from "@app/pages/api/w/[wId]/analytics/top-agents";
import type { GetWorkspaceTopUsersResponse } from "@app/pages/api/w/[wId]/analytics/top-users";
import type { GetWorkspaceUsageMetricsResponse } from "@app/pages/api/w/[wId]/analytics/usage-metrics";
import type { GetWorkspaceAuthContextResponseType } from "@app/pages/api/w/[wId]/auth-context";
import type { GetWorkspaceFeatureFlagsResponseType } from "@app/pages/api/w/[wId]/feature-flags";
import type { GetSeatAvailabilityResponseBody } from "@app/pages/api/w/[wId]/seats/availability";
import type { GetWorkspaceSeatsCountResponseBody } from "@app/pages/api/w/[wId]/seats/count";
import type { GetSubscriptionsResponseBody } from "@app/pages/api/w/[wId]/subscriptions";
import type { GetSubscriptionPricingResponseBody } from "@app/pages/api/w/[wId]/subscriptions/pricing";
import type { GetSubscriptionStatusResponseBody } from "@app/pages/api/w/[wId]/subscriptions/status";
import type { GetSubscriptionTrialInfoResponseBody } from "@app/pages/api/w/[wId]/subscriptions/trial-info";
import type { GetWorkspaceVerifiedDomainsResponseBody } from "@app/pages/api/w/[wId]/verified-domains";
import type { GetVerifyResponseBody } from "@app/pages/api/w/[wId]/verify";
import type { GetWelcomeResponseBody } from "@app/pages/api/w/[wId]/welcome";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";
import type {
  LightWorkspaceType,
  RegionRedirectError,
  WhitelistableFeature,
} from "@app/types";

// Type guard to check if response is a region redirect
export function isRegionRedirect(data: unknown): data is RegionRedirectError {
  return (
    typeof data === "object" && data !== null && "redirect" in data
    // typeof (data as RegionRedirectError).redirect === "object" &&
    // (data as RegionRedirectError).redirect !== null &&
    // "region" in (data as RegionRedirectError).redirect &&
    // "url" in (data as RegionRedirectError).redirect
  );
}

export function useWorkspace({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const workspaceFetcher: Fetcher<GetWorkspaceResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    `/api/w/${owner.sId}`,
    workspaceFetcher,
    { disabled }
  );

  return {
    workspace: data?.workspace,
    isWorkspaceLoading: !error && !data && !disabled,
    isWorkspaceValidating: isValidating,
    isWorkspaceError: error,
    mutateWorkspace: mutate,
  };
}

export function useWorkspaceSubscriptions({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const workspaceSubscrptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/subscriptions`,
    workspaceSubscrptionsFetcher
  );

  return {
    subscriptions: data?.subscriptions ?? emptyArray(),
    isSubscriptionsLoading: !error && !data,
    isSubscriptionsError: error,
  };
}

export function useWorkspaceAnalytics({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const analyticsFetcher: Fetcher<GetWorkspaceAnalyticsResponse> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/workspace-analytics`,
    analyticsFetcher,
    {
      disabled,
    }
  );

  return {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    analytics: data ? data : null,
    isMemberCountLoading: !error && !data,
    isMemberCountError: error,
  };
}

export function useWorkspaceUsageMetrics({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  interval = "day",
  disabled,
}: {
  workspaceId: string;
  days?: number;
  interval?: "day" | "week";
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceUsageMetricsResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/usage-metrics?days=${days}&interval=${interval}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    usageMetrics: data?.points ?? emptyArray(),
    isUsageMetricsLoading: !error && !data && !disabled,
    isUsageMetricsError: error,
    isUsageMetricsValidating: isValidating,
  };
}

export function useWorkspaceContextOrigin({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceContextOriginResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/source?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    contextOrigin: data ?? { total: 0, buckets: emptyArray() },
    isContextOriginLoading: !error && !data && !disabled,
    isContextOriginError: error,
    isContextOriginValidating: isValidating,
  };
}

export function useWorkspaceTools({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceToolsResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/tools?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    tools: data?.tools ?? emptyArray(),
    isToolsLoading: !error && !data && !disabled,
    isToolsError: error,
    isToolsValidating: isValidating,
  };
}

export function useWorkspaceToolUsage({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  serverName,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  serverName?: string;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceToolUsageResponse> = fetcher;
  const params = new URLSearchParams({ days: String(days) });
  if (serverName) {
    params.set("serverName", serverName);
  }
  const key = `/api/w/${workspaceId}/analytics/tool-usage?${params.toString()}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    toolUsage: data?.points ?? emptyArray(),
    isToolUsageLoading: !error && !data && !disabled,
    isToolUsageError: error,
    isToolUsageValidating: isValidating,
  };
}

export function useWorkspaceTopUsers({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  limit = 10,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  limit?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceTopUsersResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/top-users?days=${days}&limit=${limit}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    topUsers: data?.users ?? emptyArray(),
    isTopUsersLoading: !error && !data && !disabled,
    isTopUsersError: error,
    isTopUsersValidating: isValidating,
  };
}

export function useWorkspaceTopAgents({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  limit = 10,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  limit?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceTopAgentsResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/top-agents?days=${days}&limit=${limit}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    topAgents: data?.agents ?? emptyArray(),
    isTopAgentsLoading: !error && !data && !disabled,
    isTopAgentsError: error,
    isTopAgentsValidating: isValidating,
  };
}

export function useWorkspaceAnalyticsOverview({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: {
  workspaceId: string;
  days?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceAnalyticsOverviewResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/overview?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    overview: data ?? null,
    isOverviewLoading: !error && !data && !disabled,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}

export function useWorkspaceActiveSubscription({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType | undefined;
  disabled?: boolean;
}) {
  const workspaceSubscriptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    owner ? `/api/w/${owner.sId}/subscriptions` : null,
    workspaceSubscriptionsFetcher,
    {
      disabled,
    }
  );

  const activeSubscription = useMemo(() => {
    if (!data) {
      return null;
    }
    const activeSubscriptions = data.subscriptions.filter(
      (sub) => sub.status === "active"
    );
    return activeSubscriptions.length ? activeSubscriptions[0] : null;
  }, [data]);

  return {
    activeSubscription,
    isActiveSubscriptionLoading: !error && !data,
    isActiveSubscriptionError: error,
  };
}

export function useFeatureFlags({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const featureFlagsFetcher: Fetcher<GetWorkspaceFeatureFlagsResponseType> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/feature-flags`,
    featureFlagsFetcher,
    {
      disabled,
      focusThrottleInterval: 30 * 60 * 1000, // 30 minutes
    }
  );

  const hasFeature = useCallback(
    (flag: WhitelistableFeature | null | undefined) => {
      if (!flag) {
        return true;
      }
      return !!data?.feature_flags.includes(flag);
    },
    [data]
  );

  return {
    featureFlags: data?.feature_flags ?? emptyArray(),
    isFeatureFlagsLoading: !error && !data,
    isFeatureFlagsError: error,
    hasFeature,
  };
}

export function useWorkspaceProgrammaticCost({
  workspaceId,
  groupBy,
  groupByCount,
  selectedPeriod,
  billingCycleStartDay,
  filter,
  disabled,
}: {
  workspaceId: string;
  groupBy?: GroupByType;
  groupByCount?: number;
  selectedPeriod?: string;
  billingCycleStartDay: number;
  filter?: Partial<Record<GroupByType, string[]>>;
  disabled?: boolean;
}) {
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
  const key = `/api/w/${workspaceId}/analytics/programmatic-cost?${queryString}`;

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

export function useWorkspaceSeatAvailability({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const seatAvailabilityFetcher: Fetcher<GetSeatAvailabilityResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/seats/availability`,
    seatAvailabilityFetcher,
    { disabled }
  );

  return {
    hasAvailableSeats: data?.hasAvailableSeats ?? false,
    isSeatAvailabilityLoading: !error && !data && !disabled,
    isSeatAvailabilityError: error,
    mutateSeatAvailability: mutate,
  };
}

export function usePerSeatPricing({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const pricingFetcher: Fetcher<GetSubscriptionPricingResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/pricing`,
    pricingFetcher,
    { disabled }
  );

  return {
    perSeatPricing: data?.perSeatPricing ?? null,
    isPerSeatPricingLoading: !error && !data && !disabled,
    isPerSeatPricingError: error,
  };
}

export function useWorkspaceVerifiedDomains({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const verifiedDomainsFetcher: Fetcher<GetWorkspaceVerifiedDomainsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/verified-domains`,
    verifiedDomainsFetcher,
    { disabled }
  );

  return {
    verifiedDomains: data?.verifiedDomains ?? emptyArray(),
    isVerifiedDomainsLoading: !error && !data && !disabled,
    isVerifiedDomainsError: error,
    mutateVerifiedDomains: mutate,
  };
}

export function useSubscriptionTrialInfo({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const trialInfoFetcher: Fetcher<GetSubscriptionTrialInfoResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/trial-info`,
    trialInfoFetcher,
    { disabled }
  );

  return {
    trialDaysRemaining: data?.trialDaysRemaining ?? null,
    isTrialInfoLoading: !error && !data && !disabled,
    isTrialInfoError: error,
  };
}

export function useWorkspaceSeatsCount({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const seatsCountFetcher: Fetcher<GetWorkspaceSeatsCountResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/seats/count`,
    seatsCountFetcher,
    { disabled }
  );

  return {
    seatsCount: data?.seatsCount ?? 0,
    isSeatsCountLoading: !error && !data && !disabled,
    isSeatsCountError: error,
    mutateSeatsCount: mutate,
  };
}

interface UseAuthContextResult<T> {
  authContext: T | undefined;
  isAuthenticated: boolean;
  isAuthContextLoading: boolean;
  isAuthContextError: Error | undefined;
}

export function useAuthContext(options?: {
  disabled?: boolean;
}): UseAuthContextResult<
  Exclude<GetNoWorkspaceAuthContextResponseType, RegionRedirectError>
>;

export function useAuthContext(options: {
  workspaceId: string;
  disabled?: boolean;
}): UseAuthContextResult<
  Exclude<GetWorkspaceAuthContextResponseType, RegionRedirectError>
>;

export function useAuthContext(
  options: { workspaceId?: string; disabled?: boolean } = {}
) {
  const { workspaceId, disabled } = options;
  const [isRedirecting, setIsRedirecting] = useState(false);
  const regionContext = useRegionContextSafe();

  const url = workspaceId
    ? `/api/w/${workspaceId}/auth-context`
    : `/api/auth-context`;

  const authContextFetcher: Fetcher<
    GetNoWorkspaceAuthContextResponseType | GetWorkspaceAuthContextResponseType
  > = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, authContextFetcher, {
    disabled,
  });

  const isRegionRedirectResponse = error && isRegionRedirect(error.error);
  const regionRedirect = isRegionRedirectResponse
    ? error.error.redirect
    : undefined;
  const isFetching = !error && !data && !disabled;
  const isAuthenticated = !isRegionRedirectResponse && !!data?.user;

  // Handle region redirect.
  useEffect(() => {
    if (regionRedirect && regionContext) {
      regionContext.setRegionInfo({
        name: regionRedirect.region,
        url: regionRedirect.url,
      });
      void mutate();
    }
  }, [regionRedirect, mutate, regionContext]);

  // Handle login redirect.
  useEffect(() => {
    if (error && !regionRedirect) {
      setIsRedirecting(true);
      if (error.error?.type === "not_authenticated") {
        window.location.href = `${getApiBaseUrl()}/api/workos/login?returnTo=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`;
      } else {
        //TODO: Handle other error types with nicer messages.
        window.location.href = `/404`;
      }
    }
  }, [error, regionRedirect]);

  return {
    authContext: isRegionRedirectResponse ? undefined : data,
    isAuthenticated,
    isAuthContextLoading:
      isFetching || !!isRegionRedirectResponse || isRedirecting,
    isAuthContextError: error,
  };
}

export function useSubscriptionStatus({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const statusFetcher: Fetcher<GetSubscriptionStatusResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions/status`,
    statusFetcher
  );

  return {
    shouldRedirect: data?.shouldRedirect ?? false,
    redirectUrl: data?.redirectUrl ?? null,
    isSubscriptionStatusLoading: !error && !data,
    isSubscriptionStatusError: error,
  };
}

export function useWelcomeData({ workspaceId }: { workspaceId: string }) {
  const welcomeFetcher: Fetcher<GetWelcomeResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/welcome`,
    welcomeFetcher
  );

  return {
    welcomeData: data ?? null,
    isFirstAdmin: data?.isFirstAdmin ?? false,
    emailProvider: data?.emailProvider ?? "other",
    isWelcomeDataLoading: !error && !data,
    isWelcomeDataError: error,
  };
}

export function useVerifyData({ workspaceId }: { workspaceId: string }) {
  const verifyFetcher: Fetcher<GetVerifyResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/verify`,
    verifyFetcher
  );

  return {
    verifyData: data ?? null,
    isEligibleForTrial: data?.isEligibleForTrial ?? false,
    initialCountryCode: data?.initialCountryCode ?? "US",
    isVerifyDataLoading: !error && !data,
    isVerifyDataError: error,
  };
}
