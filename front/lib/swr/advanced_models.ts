import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  AllowedAdvancedModelType,
  GetAdvancedModelsResponseBody,
  GetGroupAllowedAdvancedModelsResponseBody,
  GetUserAllowedAdvancedModelsResponseBody,
  GetWorkspaceAllowedAdvancedModelsResponseBody,
  GroupAllowedAdvancedModelBody,
  GroupAllowedAdvancedModelsType,
  UserAllowedAdvancedModelBody,
  UserAllowedAdvancedModelsType,
} from "@app/types/api/advanced_models";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

export const advancedModelsUrl = (workspaceId: string) =>
  `/api/w/${workspaceId}/advanced_models`;

export const userAllowedAdvancedModelsUrl = (workspaceId: string) =>
  `${advancedModelsUrl(workspaceId)}/allowed/users`;

export const groupAllowedAdvancedModelsUrl = (workspaceId: string) =>
  `${advancedModelsUrl(workspaceId)}/allowed/groups`;

export const workspaceAllowedAdvancedModelsUrl = (workspaceId: string) =>
  `${advancedModelsUrl(workspaceId)}/allowed/workspace`;

export function useAdvancedModels({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const advancedModelsFetcher: Fetcher<GetAdvancedModelsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    advancedModelsUrl(owner.sId),
    advancedModelsFetcher,
    { disabled }
  );

  return {
    models: data?.models ?? emptyArray(),
    isAdvancedModelsLoading: !error && !data && !disabled,
    isAdvancedModelsError: !!error,
    mutateAdvancedModels: mutate,
  };
}

export function useUserAllowedAdvancedModels({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const userAllowedAdvancedModelsFetcher: Fetcher<GetUserAllowedAdvancedModelsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    userAllowedAdvancedModelsUrl(owner.sId),
    userAllowedAdvancedModelsFetcher,
    { disabled }
  );

  return {
    users: data?.users ?? emptyArray<UserAllowedAdvancedModelsType>(),
    isUserAllowedAdvancedModelsLoading: !error && !data && !disabled,
    isUserAllowedAdvancedModelsError: !!error,
    mutateUserAllowedAdvancedModels: mutate,
  };
}

export function useGroupAllowedAdvancedModels({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupAllowedAdvancedModelsFetcher: Fetcher<GetGroupAllowedAdvancedModelsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    groupAllowedAdvancedModelsUrl(owner.sId),
    groupAllowedAdvancedModelsFetcher,
    { disabled }
  );

  return {
    groups: data?.groups ?? emptyArray<GroupAllowedAdvancedModelsType>(),
    isGroupAllowedAdvancedModelsLoading: !error && !data && !disabled,
    isGroupAllowedAdvancedModelsError: !!error,
    mutateGroupAllowedAdvancedModels: mutate,
  };
}

export function useWorkspaceAllowedAdvancedModels({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const workspaceAllowedAdvancedModelsFetcher: Fetcher<GetWorkspaceAllowedAdvancedModelsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    workspaceAllowedAdvancedModelsUrl(owner.sId),
    workspaceAllowedAdvancedModelsFetcher,
    { disabled }
  );

  return {
    models: data?.models ?? emptyArray<AllowedAdvancedModelType>(),
    isWorkspaceAllowedAdvancedModelsLoading: !error && !data && !disabled,
    isWorkspaceAllowedAdvancedModelsError: !!error,
    mutateWorkspaceAllowedAdvancedModels: mutate,
  };
}

export function useUserAllowedAdvancedModelMutations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateUserAllowedAdvancedModels } = useUserAllowedAdvancedModels({
    owner,
    disabled: true,
  });
  const [isMutating, setIsMutating] = useState(false);

  const addUserAllowedAdvancedModel = useCallback(
    async (body: UserAllowedAdvancedModelBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          userAllowedAdvancedModelsUrl(owner.sId),
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
            title: "Failed to allow advanced model for user",
            description: error.message,
          });
          return false;
        }

        await mutateUserAllowedAdvancedModels();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to allow advanced model for user",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateUserAllowedAdvancedModels, sendNotification]
  );

  const removeUserAllowedAdvancedModel = useCallback(
    async (body: UserAllowedAdvancedModelBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          userAllowedAdvancedModelsUrl(owner.sId),
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
            title: "Failed to remove advanced model for user",
            description: error.message,
          });
          return false;
        }

        await mutateUserAllowedAdvancedModels();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to remove advanced model for user",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateUserAllowedAdvancedModels, sendNotification]
  );

  return {
    addUserAllowedAdvancedModel,
    removeUserAllowedAdvancedModel,
    isUserAllowedAdvancedModelMutating: isMutating,
  };
}

export function useGroupAllowedAdvancedModelMutations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateGroupAllowedAdvancedModels } = useGroupAllowedAdvancedModels({
    owner,
    disabled: true,
  });
  const [isMutating, setIsMutating] = useState(false);

  const addGroupAllowedAdvancedModel = useCallback(
    async (body: GroupAllowedAdvancedModelBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          groupAllowedAdvancedModelsUrl(owner.sId),
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
            title: "Failed to allow advanced model for group",
            description: error.message,
          });
          return false;
        }

        await mutateGroupAllowedAdvancedModels();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to allow advanced model for group",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateGroupAllowedAdvancedModels, sendNotification]
  );

  const removeGroupAllowedAdvancedModel = useCallback(
    async (body: GroupAllowedAdvancedModelBody): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          groupAllowedAdvancedModelsUrl(owner.sId),
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
            title: "Failed to remove advanced model for group",
            description: error.message,
          });
          return false;
        }

        await mutateGroupAllowedAdvancedModels();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to remove advanced model for group",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateGroupAllowedAdvancedModels, sendNotification]
  );

  return {
    addGroupAllowedAdvancedModel,
    removeGroupAllowedAdvancedModel,
    isGroupAllowedAdvancedModelMutating: isMutating,
  };
}

export function useWorkspaceAllowedAdvancedModelMutations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutateWorkspaceAllowedAdvancedModels } =
    useWorkspaceAllowedAdvancedModels({
      owner,
      disabled: true,
    });
  const [isMutating, setIsMutating] = useState(false);

  const addWorkspaceAllowedAdvancedModel = useCallback(
    async (body: AllowedAdvancedModelType): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          workspaceAllowedAdvancedModelsUrl(owner.sId),
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
            title: "Failed to allow advanced model for workspace",
            description: error.message,
          });
          return false;
        }

        await mutateWorkspaceAllowedAdvancedModels();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to allow advanced model for workspace",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateWorkspaceAllowedAdvancedModels, sendNotification]
  );

  const removeWorkspaceAllowedAdvancedModel = useCallback(
    async (body: AllowedAdvancedModelType): Promise<boolean> => {
      setIsMutating(true);
      try {
        const response = await clientFetch(
          workspaceAllowedAdvancedModelsUrl(owner.sId),
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
            title: "Failed to remove advanced model for workspace",
            description: error.message,
          });
          return false;
        }

        await mutateWorkspaceAllowedAdvancedModels();
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to remove advanced model for workspace",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [owner.sId, mutateWorkspaceAllowedAdvancedModels, sendNotification]
  );

  return {
    addWorkspaceAllowedAdvancedModel,
    removeWorkspaceAllowedAdvancedModel,
    isWorkspaceAllowedAdvancedModelMutating: isMutating,
  };
}
