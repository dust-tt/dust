import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { GetWorkspaceUsageStatusResponseBody } from "@app/lib/metronome/user_block";
import type { GetUserApprovalsResponseBody } from "@app/lib/resources/user_resource";
import { nonRedirectingFetcher } from "@app/lib/swr/fetcher";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type { GetPendingInvitationsResponseBody } from "@app/types/api/invitation";
import type { GetUserMemoryResponseBody } from "@app/types/api/me/memory";
import type { GetSlackNotificationResponseBody } from "@app/types/api/me/slack_notifications";
import type {
  GetUserMetadataResponseBody,
  GetUserResponseBody,
} from "@app/types/api/user";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher, SWRConfiguration } from "swr";

export function useUser(
  swrOptions?: SWRConfiguration & {
    disabled?: boolean;
    // Defaults to true. Set to false on pages where a 401 should leave the
    // page in place rather than bounce the visitor through the login flow.
    redirectOnUnauthenticated?: boolean;
  }
) {
  const { fetcher } = useFetcher();
  const skipRedirect = swrOptions?.redirectOnUnauthenticated === false;
  const userFetcher: Fetcher<GetUserResponseBody> = skipRedirect
    ? nonRedirectingFetcher
    : fetcher;
  const { data, error, mutate } = useSWRWithDefaults("/api/user", userFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    // 401 here is the expected outcome for anonymous visitors -> don't retry
    // (default would log it to datadog 16 times).
    ...(skipRedirect ? { shouldRetryOnError: false } : {}),
    ...swrOptions,
  });

  return {
    user: data ? data.user : null,
    isUserLoading: !error && !data,
    isUserError: error,
    mutateUser: mutate,
  };
}

export function useUserMetadata(
  key: string,
  swrOptions?: SWRConfiguration & {
    disabled?: boolean;
    workspaceId?: string;
  }
) {
  const { fetcher } = useFetcher();
  const userMetadataFetcher: Fetcher<GetUserMetadataResponseBody> = fetcher;

  let url = `/api/user/metadata/${encodeURIComponent(key)}`;
  if (swrOptions?.workspaceId) {
    url += `?workspaceId=${encodeURIComponent(swrOptions.workspaceId)}`;
  }

  const { data, error, mutate } = useSWRWithDefaults(url, userMetadataFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    ...swrOptions,
  });

  return {
    metadata: data ? data.metadata : null,
    isMetadataLoading: !error && !data,
    isMetadataError: error,
    mutateMetadata: mutate,
  };
}

export function useUserApprovals(owner: LightWorkspaceType) {
  const { fetcher } = useFetcher();
  const userApprovalsFetcher: Fetcher<GetUserApprovalsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/me/approvals`,
    userApprovalsFetcher
  );

  return {
    approvals: data ? data.approvals : [],
    isApprovalsLoading: !error && !data,
    isApprovalsError: error,
    mutateApprovals: mutate,
  };
}

export function useCompleteUserOnboarding() {
  const completeUserOnboarding = async () => {
    return clientFetch("/api/user/onboarding/complete", {
      method: "POST",
    });
  };

  return { completeUserOnboarding };
}

export function useDeleteToolApproval() {
  const deleteToolApproval = async (
    owner: LightWorkspaceType,
    mcpServerId: string
  ) => {
    return clientFetch(
      `/api/w/${owner.sId}/me/approvals?mcpServerId=${encodeURIComponent(mcpServerId)}`,
      { method: "DELETE" }
    );
  };

  return { deleteToolApproval };
}

export function usePatchUser() {
  const { mutateUser } = useUser();
  const sendNotification = useSendNotification();

  const patchUser = async (
    firstName: string,
    lastName: string,
    notifySuccess: boolean,
    jobType?: JobType,
    imageUrl?: string | null,
    favoritePlatforms?: FavoritePlatform[],
    emailProvider?: EmailProviderType,
    workspaceId?: string
  ) => {
    const res = await clientFetch("/api/user", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName,
        lastName,
        jobType,
        imageUrl,
        favoritePlatforms,
        emailProvider,
        workspaceId,
      }),
    });

    if (res.ok) {
      if (notifySuccess) {
        sendNotification({
          type: "success",
          title: "Updated User",
          description: `Successfully updated your profile.`,
        });
      }

      await mutateUser();

      return res.json();
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error Updating User",
        description: `Error: ${errorData.message}`,
      });

      return null;
    }
  };

  return { patchUser };
}

export function usePendingInvitations({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const pendingInvitationsFetcher: Fetcher<GetPendingInvitationsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/me/pending-invitations`,
    pendingInvitationsFetcher,
    { disabled }
  );

  return {
    pendingInvitations: data?.pendingInvitations ?? emptyArray(),
    isPendingInvitationsLoading: !error && !data && !disabled,
    isPendingInvitationsError: error,
    mutatePendingInvitations: mutate,
  };
}

export function useUserMemory({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const memoryFetcher: Fetcher<GetUserMemoryResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/me/memory`,
    memoryFetcher,
    { disabled }
  );

  const setMemory = useCallback(
    async (update: {
      content?: string;
      enabled?: boolean;
    }): Promise<boolean> => {
      const res = await clientFetch(`/api/w/${owner.sId}/me/memory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      if (res.ok) {
        sendNotification({ type: "success", title: "Memory saved." });
        await mutate();
        return true;
      }

      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error saving memory",
        description: errorData.message,
      });
      return false;
    },
    [owner.sId, sendNotification, mutate]
  );

  return {
    content: data?.content ?? "",
    isMemoryEnabled: data?.enabled ?? false,
    isMemoryLoading: !error && !data && !disabled,
    isMemoryError: error,
    mutateMemory: mutate,
    setMemory,
  };
}

export function useSlackNotifications(
  workspaceId: string,
  options?: {
    disabled?: boolean;
  }
) {
  const { fetcher } = useFetcher();
  const slackNotificationsFetcher: Fetcher<GetSlackNotificationResponseBody> =
    fetcher;

  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/me/slack-notifications`,
    slackNotificationsFetcher,
    { disabled: options?.disabled }
  );

  const isSlackSetupLoading = isLoading && !options?.disabled;

  const canConfigureSlack = useMemo(() => {
    return data?.canConfigure === true;
  }, [data]);

  return {
    isSlackSetupLoading,
    canConfigureSlack,
  };
}

export function useWorkspaceUsageStatus({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const usageStatusFetcher: Fetcher<GetWorkspaceUsageStatusResponseBody> =
    fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/usage-status`,
    usageStatusFetcher,
    { disabled }
  );

  return {
    userNearCreditLimit: data?.userNearCreditLimit ?? false,
    poolCreditState: data?.poolCreditState ?? "active",
    programmaticCreditStatus: data?.programmaticCreditStatus ?? "active",
    programmaticWarningReached: data?.programmaticWarningReached ?? false,
    balanceThresholdReached: data?.balanceThresholdReached ?? false,
    userBlockedReason: data?.userBlockedReason ?? null,
    canRequestUpgrade: data?.canRequestUpgrade ?? false,
    hasPendingUpgradeRequest: data?.hasPendingUpgradeRequest ?? false,
    willAutoUpgrade: data?.willAutoUpgrade ?? false,
    requireReason: data?.requireReason ?? false,
    isUsageStatusLoading: !error && !data && !disabled,
  };
}
