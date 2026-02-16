import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type { GetUserResponseBody } from "@app/pages/api/user";
import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import type { GetUserApprovalsResponseBody } from "@app/pages/api/w/[wId]/me/approvals";
import type { GetPendingInvitationsResponseBody } from "@app/pages/api/w/[wId]/me/pending-invitations";
import type {
  GetSlackNotificationResponseBody,
  PostSlackNotificationResponseBody,
} from "@app/pages/api/w/[wId]/me/slack-notifications";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";
import type { Fetcher, SWRConfiguration } from "swr";

export function useUser(
  swrOptions?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const userFetcher: Fetcher<GetUserResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults("/api/user", userFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
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
  const userMetadataFetcher: Fetcher<GetUserMetadataResponseBody> = fetcher;

  let url = `/api/user/metadata/${encodeURIComponent(key)}`;
  if (swrOptions?.workspaceId) {
    url += `?workspaceId=${encodeURIComponent(swrOptions.workspaceId)}`;
  }

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    userMetadataFetcher,
    swrOptions
  );

  return {
    metadata: data ? data.metadata : null,
    isMetadataLoading: !error && !data,
    isMetadataError: error,
    mutateMetadata: mutate,
  };
}

export function useUserApprovals(owner: LightWorkspaceType) {
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

export function useDeleteMetadata() {
  const deleteMetadata = async (prefix: string) => {
    return clientFetch(`/api/user/metadata/${encodeURIComponent(prefix)}`, {
      method: "DELETE",
    });
  };

  return { deleteMetadata };
}

export function useIsOnboardingConversation(
  conversationId: string | null,
  workspaceId: string
) {
  const { metadata, isMetadataLoading } = useUserMetadata(
    "onboarding:conversation",
    {
      disabled: !conversationId,
      workspaceId,
    }
  );

  return {
    isOnboardingConversation:
      !!conversationId &&
      !!metadata?.value &&
      metadata.value === conversationId,
    isLoading: isMetadataLoading,
  };
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

export function useSetupSlackNotifications(
  workspaceId: string,
  options?: {
    disabled?: boolean;
  }
) {
  const slackNotificationsFetcher: Fetcher<GetSlackNotificationResponseBody> =
    fetcher;

  const {
    data,
    isLoading,
    mutate: mutateIsSlackSetup,
  } = useSWRWithDefaults(
    `/api/w/${workspaceId}/me/slack-notifications`,
    slackNotificationsFetcher,
    { disabled: options?.disabled }
  );

  const [isConfiguringSlack, setIsConfiguringSlack] = useState(false);

  const isSlackSetupLoading = useMemo(
    () => isLoading && !options?.disabled,
    [isLoading, options?.disabled]
  );

  const isSlackSetup = useMemo(() => {
    return data?.isConfigured === true;
  }, [data]);

  const sendNotification = useSendNotification();
  const setupSlackNotifications = useCallback(async () => {
    setIsConfiguringSlack(true);
    const res = await clientFetch(
      `/api/w/${workspaceId}/me/slack-notifications`,
      {
        method: "POST",
      }
    );

    if (!res.ok) {
      setIsConfiguringSlack(false);
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error Setting up Slack Notifications",
        description: `Error: ${errorData.message}`,
      });

      return;
    }
    const data: PostSlackNotificationResponseBody = await res.json();
    const openedWindow = window.open(data.oauthUrl, "_blank");

    // When the opened window is closed, call the PATCH endpoint to setup the channel
    // endpoint for the user, so that he can receive notifications as private messages in Slack.
    let completed = false;
    const completeSetup = async () => {
      const res = await clientFetch(
        `/api/w/${workspaceId}/me/slack-notifications`,
        {
          method: "PATCH",
        }
      );
      if (!res.ok) {
        setIsConfiguringSlack(false);
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Error Setting up Slack Notifications",
          description: `Error: ${errorData.message}`,
        });
        return;
      }

      void mutateIsSlackSetup(() => ({
        isConfigured: true,
      }));
      sendNotification({
        type: "success",
        title: "Slack Notifications Setup",
        description: "Successfully configured Slack notifications.",
      });
      setIsConfiguringSlack(false);
    };

    const interval = setInterval(async () => {
      if (openedWindow && openedWindow.closed) {
        clearInterval(interval);
        await completeSetup();
        completed = true;
      }
    }, 500);

    // Cleanup after 5 minutes (safety timeout)
    setTimeout(
      () => {
        clearInterval(interval);
        if (!completed) {
          sendNotification({
            type: "error",
            title: "Setup Timeout",
            description: "Authentication window timed out.",
          });
          setIsConfiguringSlack(false);
          completed = true;
        }
      },
      5 * 60 * 1000
    );
  }, [workspaceId, sendNotification, mutateIsSlackSetup]);

  return {
    isSlackSetup,
    isSlackSetupLoading,
    isConfiguringSlack,
    mutateIsSlackSetup,
    setupSlackNotifications,
  };
}
