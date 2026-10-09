import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
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
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

const modelTiersUrl = (workspaceId: string) =>
  `/api/w/${workspaceId}/model_tiers`;

const userAllowedModelTiersUrl = (workspaceId: string) =>
  `${modelTiersUrl(workspaceId)}/allowed/users`;

const groupAllowedModelTiersUrl = (workspaceId: string) =>
  `${modelTiersUrl(workspaceId)}/allowed/groups`;

const workspaceAllowedModelTiersUrl = (workspaceId: string) =>
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          sendApiErrorNotification({
            title: t`Failed to set model tier for user`,
            error,
          });
          return false;
        }

        await mutateUserAllowedModelTiers();
        sendNotification({
          type: "success",
          title: t`Model tier updated`,
          description: t`The model tier for the user has been updated.`,
        });
        return true;
      } catch (e) {
        sendApiErrorNotification({
          title: t`Failed to set model tier for user`,
          error: e,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [
      owner.sId,
      mutateUserAllowedModelTiers,
      sendNotification,
      sendApiErrorNotification,
      t,
    ]
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
          sendApiErrorNotification({
            title: t`Failed to clear model tier override for user`,
            error,
          });
          return false;
        }

        await mutateUserAllowedModelTiers();
        sendNotification({
          type: "success",
          title: t`Model tier override cleared`,
          description: t`The user now inherits the model tier.`,
        });
        return true;
      } catch (e) {
        sendApiErrorNotification({
          title: t`Failed to clear model tier override for user`,
          error: e,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [
      owner.sId,
      mutateUserAllowedModelTiers,
      sendNotification,
      sendApiErrorNotification,
      t,
    ]
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          sendApiErrorNotification({
            title: t`Failed to set model tier for group`,
            error,
          });
          return false;
        }

        await mutateGroupAllowedModelTiers();
        sendNotification({
          type: "success",
          title: t`Model tier updated`,
          description: t`The model tier for the group has been updated.`,
        });
        return true;
      } catch (e) {
        sendApiErrorNotification({
          title: t`Failed to set model tier for group`,
          error: e,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [
      owner.sId,
      mutateGroupAllowedModelTiers,
      sendNotification,
      sendApiErrorNotification,
      t,
    ]
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
          sendApiErrorNotification({
            title: t`Failed to clear model tier for group`,
            error,
          });
          return false;
        }

        await mutateGroupAllowedModelTiers();
        sendNotification({
          type: "success",
          title: t`Model tier cleared`,
          description: t`The group now inherits the model tier.`,
        });
        return true;
      } catch (e) {
        sendApiErrorNotification({
          title: t`Failed to clear model tier for group`,
          error: e,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [
      owner.sId,
      mutateGroupAllowedModelTiers,
      sendNotification,
      sendApiErrorNotification,
      t,
    ]
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          sendApiErrorNotification({
            title: t`Failed to set workspace model tier`,
            error,
          });
          return false;
        }

        await mutateWorkspaceAllowedModelTiers();
        sendNotification({
          type: "success",
          title: t`Model tier updated`,
          description: t`The model tier for the workspace has been updated.`,
        });
        return true;
      } catch (e) {
        sendApiErrorNotification({
          title: t`Failed to set workspace model tier`,
          error: e,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [
      owner.sId,
      mutateWorkspaceAllowedModelTiers,
      sendNotification,
      sendApiErrorNotification,
      t,
    ]
  );

  return {
    setWorkspaceAllowedModelTier,
    isWorkspaceAllowedModelTierMutating: isMutating,
  };
}
