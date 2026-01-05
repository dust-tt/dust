import type { Fetcher, SWRConfiguration } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import type { GetUserResponseBody } from "@app/pages/api/user";
import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import type { GetUserApprovalsResponseBody } from "@app/pages/api/w/[wId]/me/approvals";
import type { LightWorkspaceType } from "@app/types";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import type { JobType } from "@app/types/job_type";

export function useUser(
  swrOptions?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const userFetcher: Fetcher<GetUserResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    "/api/user",
    userFetcher,
    swrOptions
  );

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
  }
) {
  const userMetadataFetcher: Fetcher<GetUserMetadataResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/user/metadata/${encodeURIComponent(key)}`,
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
    // eslint-disable-next-line no-restricted-globals
    return fetch(`/api/user/metadata/${encodeURIComponent(prefix)}`, {
      method: "DELETE",
    });
  };

  return { deleteMetadata };
}

export function useIsOnboardingConversation(
  conversationId: string | null,
  workspaceId: string
) {
  const metadataKey = `onboarding:conversation?wId=${workspaceId}`;

  const { metadata, isMetadataLoading } = useUserMetadata(metadataKey, {
    disabled: !conversationId,
  });

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
