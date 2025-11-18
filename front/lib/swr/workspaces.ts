import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWorkspaceResponseBody } from "@app/pages/api/w/[wId]";
import type { GetWorkspaceCumulativeCostResponse } from "@app/pages/api/w/[wId]/analytics/cumulative-cost";
import type { GetWorkspaceUsageMetricsResponse } from "@app/pages/api/w/[wId]/analytics/usage";
import type { GetWorkspaceFeatureFlagsResponseType } from "@app/pages/api/w/[wId]/feature-flags";
import type { GetSubscriptionsResponseBody } from "@app/pages/api/w/[wId]/subscriptions";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";
import type { LightWorkspaceType, WhitelistableFeature } from "@app/types";

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
    analytics: data ? data : null,
    isMemberCountLoading: !error && !data,
    isMemberCountError: error,
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

export function useWorspaceUsageMetrics({
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
  const key = `/api/w/${workspaceId}/analytics/usage?days=${days}&interval=${interval}`;

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

export function useWorkspaceCumulativeCost({
  workspaceId,
  groupBy,
  disabled,
}: {
  workspaceId: string;
  groupBy?: "agent" | "origin";
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetWorkspaceCumulativeCostResponse> = fetcher;
  const key = `/api/w/${workspaceId}/analytics/cumulative-cost${groupBy ? `?groupBy=${groupBy}` : ""}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    cumulativeCostData: data,
    isCumulativeCostLoading: !error && !data && !disabled,
    isCumulativeCostError: error,
    isCumulativeCostValidating: isValidating,
  };
}
