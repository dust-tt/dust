import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetWorkspaceFeatureFlagsResponseType } from "@app/pages/api/w/[wId]/feature-flags";
import type { GetSubscriptionsResponseBody } from "@app/pages/api/w/[wId]/subscriptions";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";
import type {
  WhitelistableFeature,
  WorkspaceEnterpriseConnection,
  WorkspaceType,
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
    subscriptions: data?.subscriptions ?? emptyArray(),
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

export function useWorkOSFullSync(owner: WorkspaceType) {
  const sendNotification = useSendNotification();

  const triggerFullSync = async () => {
    const res = await fetch(`/api/w/${owner.sId}/workos/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const result = await res.json();
      sendNotification({
        type: "success",
        title: "WorkOS Sync Completed",
      });
      return result;
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "WorkOS Sync Failed",
        description: errorData.message,
      });
    }
  };

  return { triggerFullSync };
}
