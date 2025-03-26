import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWorkspaceFeatureFlagsResponseType } from "@app/pages/api/w/[wId]/feature-flags";
import type { GetSubscriptionsResponseBody } from "@app/pages/api/w/[wId]/subscriptions";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";
import type {
  WhitelistableFeature,
  WorkspaceEnterpriseConnection,
} from "@app/types";

export function useWorkspaceSubscriptions({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const workspaceSubscrptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions`,
    workspaceSubscrptionsFetcher
  );

  return {
    subscriptions: useMemo(() => (data ? data.subscriptions : []), [data]),
    isSubscriptionsLoading: !error && !data,
    isSubscriptionsError: error,
  };
}

export function useWorkspaceAnalytics({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const analyticsFetcher: Fetcher<GetWorkspaceAnalyticsResponse> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/workspace-analytics`,
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

export function useWorkspaceEnterpriseConnection({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const workspaceEnterpriseConnectionFetcher: Fetcher<{
    connection: WorkspaceEnterpriseConnection;
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    workspaceId ? `/api/w/${workspaceId}/enterprise-connection` : null,
    workspaceEnterpriseConnectionFetcher,
    {
      disabled,
    }
  );

  return {
    enterpriseConnection: data ? data.connection : null,
    isEnterpriseConnectionLoading: !error && !data,
    isEnterpriseConnectionError: error,
    mutateEnterpriseConnection: mutate,
  };
}

export function useWorkspaceActiveSubscription({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const workspaceSubscriptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/subscriptions`,
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
    }
  );

  const hasFeature = useCallback(
    (feature: WhitelistableFeature) => {
      return !!data?.feature_flags.includes(feature);
    },
    [data]
  );

  return {
    featureFlags: data ? data.feature_flags : [],
    isFeatureFlagsLoading: !error && !data,
    isFeatureFlagsError: error,
    hasFeature,
  };
}
