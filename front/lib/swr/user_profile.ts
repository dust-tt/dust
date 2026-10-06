import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetMyAgentMemoriesResponseBody,
  GetUserProfileResponseBody,
  PatchMyProfileBody,
  PatchMyProfileResponseBody,
} from "@app/types/api/user_profile";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

function getUserProfileKey(workspaceId: string, userId: string) {
  return `/api/w/${workspaceId}/members/${userId}/profile`;
}

export function useUserProfile({
  owner,
  userId,
  disabled,
}: {
  owner: LightWorkspaceType;
  userId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const profileFetcher: Fetcher<GetUserProfileResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    userId ? getUserProfileKey(owner.sId, userId) : null,
    profileFetcher,
    { disabled: disabled || !userId }
  );

  return {
    profile: data?.profile ?? null,
    isProfileLoading: !error && !data && !disabled && !!userId,
    isProfileError: error,
    mutateProfile: mutate,
  };
}

export function usePatchMyProfile({
  owner,
  userId,
}: {
  owner: LightWorkspaceType;
  userId: string;
}) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

  const patchMyProfile = useCallback(
    async (body: PatchMyProfileBody): Promise<boolean> => {
      const res = await clientFetch(`/api/w/${owner.sId}/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: t`Could not update your profile`,
          description: errorData.message,
        });
        return false;
      }

      const { profile }: PatchMyProfileResponseBody = await res.json();
      await mutate(getUserProfileKey(owner.sId, userId), { profile }, false);
      return true;
    },
    [owner.sId, userId, sendNotification, mutate, t]
  );

  return { patchMyProfile };
}

export function useMyAgentMemories({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const agentMemoriesFetcher: Fetcher<GetMyAgentMemoriesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/me/agent-memories`,
    agentMemoriesFetcher,
    { disabled }
  );

  return {
    agentMemories: data?.agentMemories ?? emptyArray(),
    isAgentMemoriesLoading: !error && !data && !disabled,
    isAgentMemoriesError: error,
    mutateAgentMemories: mutate,
  };
}
