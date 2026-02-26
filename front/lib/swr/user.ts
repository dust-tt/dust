import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type { GetUserResponseBody } from "@app/pages/api/user";
import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import type { GetUserApprovalsResponseBody } from "@app/pages/api/w/[wId]/me/approvals";
import type { GetPendingInvitationsResponseBody } from "@app/pages/api/w/[wId]/me/pending-invitations";
import type { GetSlackNotificationResponseBody } from "@app/pages/api/w/[wId]/me/slack-notifications";
import { isAPIErrorResponse } from "@app/types/error";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher, SWRConfiguration } from "swr";

export function useUser(
  swrOptions?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const { fetcher } = useFetcher();
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

export function useDeleteMetadata() {
  const { fetcher } = useFetcher();

  const deleteMetadata = async (prefix: string) => {
    return fetcher(`/api/user/metadata/${encodeURIComponent(prefix)}`, {
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
  const { fetcherWithBody } = useFetcher();

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
    try {
      const data = await fetcherWithBody([
        "/api/user",
        {
          firstName,
          lastName,
          jobType,
          imageUrl,
          favoritePlatforms,
          emailProvider,
          workspaceId,
        },
        "PATCH",
      ]);

      if (notifySuccess) {
        sendNotification({
          type: "success",
          title: "Updated User",
          description: `Successfully updated your profile.`,
        });
      }

      await mutateUser();

      return data;
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Error Updating User",
          description: `Error: ${e.error.message}`,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Error Updating User",
          description: "An error occurred",
        });
      }

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
