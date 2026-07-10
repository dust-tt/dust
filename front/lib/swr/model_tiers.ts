import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  AllowedModelTierBody,
  GetGroupAllowedModelTiersResponseBody,
  GetModelTiersResponseBody,
  GetUserAllowedModelTiersResponseBody,
  GetWorkspaceAllowedModelTiersResponseBody,
  GroupAllowedModelTierBody,
  GroupAllowedModelTierClearBody,
  GroupAllowedModelTiersType,
  UserAllowedModelTierBody,
  UserAllowedModelTierClearBody,
  UserAllowedModelTiersType,
} from "@app/types/api/model_tiers";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

export const modelTiersUrl = (workspaceId: string) =>
  `/api/w/${workspaceId}/model_tiers`;

export const userAllowedModelTiersUrl = (workspaceId: string) =>
  `${modelTiersUrl(workspaceId)}/allowed/users`;

export const groupAllowedModelTiersUrl = (workspaceId: string) =>
  `${modelTiersUrl(workspaceId)}/allowed/groups`;

export const workspaceAllowedModelTiersUrl = (workspaceId: string) =>
  `${modelTiersUrl(workspaceId)}/allowed/workspace`;

export function useModelTiers({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const modelTiersFetcher: Fetcher<GetModelTiersResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    modelTiersUrl(owner.sId),
    modelTiersFetcher,
    { disabled }
  );

  return {
    tiers: data?.tiers ?? emptyArray(),
    isModelTiersLoading: !error && !data && !disabled,
    isModelTiersError: !!error,
    mutateModelTiers: mutate,
  };
}

export function useUserAllowedModelTiers({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const userAllowedModelTiersFetcher: Fetcher<GetUserAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    userAllowedModelTiersUrl(owner.sId),
    userAllowedModelTiersFetcher,
    { disabled }
  );

  return {
    users: data?.users ?? emptyArray<UserAllowedModelTiersType>(),
    isUserAllowedModelTiersLoading: !error && !data && !disabled,
    isUserAllowedModelTiersError: !!error,
    mutateUserAllowedModelTiers: mutate,
  };
}

export function useGroupAllowedModelTiers({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupAllowedModelTiersFetcher: Fetcher<GetGroupAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    groupAllowedModelTiersUrl(owner.sId),
    groupAllowedModelTiersFetcher,
    { disabled }
  );

  return {
    groups: data?.groups ?? emptyArray<GroupAllowedModelTiersType>(),
    isGroupAllowedModelTiersLoading: !error && !data && !disabled,
    isGroupAllowedModelTiersError: !!error,
    mutateGroupAllowedModelTiers: mutate,
  };
}

export function useWorkspaceAllowedModelTiers({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const workspaceAllowedModelTiersFetcher: Fetcher<GetWorkspaceAllowedModelTiersResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    workspaceAllowedModelTiersUrl(owner.sId),
    workspaceAllowedModelTiersFetcher,
    { disabled }
  );

  return {
    maxTierName: data?.maxTierName ?? null,
    isWorkspaceAllowedModelTiersLoading: !error && !data && !disabled,
    isWorkspaceAllowedModelTiersError: !!error,
    mutateWorkspaceAllowedModelTiers: mutate,
  };
}

export function useUserAllowedModelTierMutations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateUserAllowedModelTiers } = useUserAllowedModelTiers({
    owner,
    disabled: true,
  });
  const [isMutating, setIsMutating] = useState(false);

  const setUserAllowedModelTier = useCallback(
    async (body: UserAllowedModelTierBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          userAllowedModelTiersUrl(owner.sId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to set model tier for user",
            description: error.message,
          });
          return false;
        }

        await mutateUserAllowedModelTiers();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to set model tier for user",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateUserAllowedModelTiers, sendNotification]
  );

  const clearUserAllowedModelTier = useCallback(
    async (body: UserAllowedModelTierClearBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          userAllowedModelTiersUrl(owner.sId),
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to clear model tier override for user",
            description: error.message,
          });
          return false;
        }

        await mutateUserAllowedModelTiers();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to clear model tier override for user",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateUserAllowedModelTiers, sendNotification]
  );

  return {
    setUserAllowedModelTier,
    clearUserAllowedModelTier,
    isUserAllowedModelTierMutating: isMutating,
  };
}

export function useGroupAllowedModelTierMutations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateGroupAllowedModelTiers } = useGroupAllowedModelTiers({
    owner,
    disabled: true,
  });
  const [isMutating, setIsMutating] = useState(false);

  const setGroupAllowedModelTier = useCallback(
    async (body: GroupAllowedModelTierBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          groupAllowedModelTiersUrl(owner.sId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to set model tier for group",
            description: error.message,
          });
          return false;
        }

        await mutateGroupAllowedModelTiers();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to set model tier for group",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateGroupAllowedModelTiers, sendNotification]
  );

  const clearGroupAllowedModelTier = useCallback(
    async (body: GroupAllowedModelTierClearBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          groupAllowedModelTiersUrl(owner.sId),
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to clear model tier for group",
            description: error.message,
          });
          return false;
        }

        await mutateGroupAllowedModelTiers();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to clear model tier for group",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateGroupAllowedModelTiers, sendNotification]
  );

  return {
    setGroupAllowedModelTier,
    clearGroupAllowedModelTier,
    isGroupAllowedModelTierMutating: isMutating,
  };
}

export function useWorkspaceAllowedModelTierMutations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateWorkspaceAllowedModelTiers } = useWorkspaceAllowedModelTiers({
    owner,
    disabled: true,
  });
  const [isMutating, setIsMutating] = useState(false);

  const setWorkspaceAllowedModelTier = useCallback(
    async (body: AllowedModelTierBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          workspaceAllowedModelTiersUrl(owner.sId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to set workspace model tier",
            description: error.message,
          });
          return false;
        }

        await mutateWorkspaceAllowedModelTiers();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to set workspace model tier",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateWorkspaceAllowedModelTiers, sendNotification]
  );

  return {
    setWorkspaceAllowedModelTier,
    isWorkspaceAllowedModelTierMutating: isMutating,
  };
}
