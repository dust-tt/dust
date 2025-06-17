import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWorkspaceFeatureFlagsResponseType } from "@app/pages/api/w/[wId]/feature-flags";
import type { GetSubscriptionsResponseBody } from "@app/pages/api/w/[wId]/subscriptions";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";
import type {
  LightWorkspaceType,
  WhitelistableFeature,
  WorkspaceEnterpriseConnection,
} from "@app/types";

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

// TODO(workos): Remove this once we have migrated to WorkOS.
export function useWorkspaceEnterpriseConnection({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const workspaceEnterpriseConnectionFetcher: Fetcher<{
    connection: WorkspaceEnterpriseConnection;
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/enterprise-connection`,
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
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const workspaceSubscriptionsFetcher: Fetcher<GetSubscriptionsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/subscriptions`,
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
