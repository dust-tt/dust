import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import {
  buildPodTasksListSwrKey,
  isPodTasksListSwrKey,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { usePodConversationsSummary } from "@app/hooks/conversations";
import { useDebounce } from "@app/hooks/useDebounce";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import type {
  GetProjectContextResponseBody,
  PostProjectContextContentNodeResponseBody as PostPodContextContentNodeResponseBody,
} from "@app/lib/api/projects/context";
import { clientFetch } from "@app/lib/egress/client";
import { compareStrings } from "@app/lib/i18n/format";
import { flattenPodTasksWithStableAssigneeOrder } from "@app/lib/project_task/display_order";
import type { PostSeedInitialPodTasksResponseBody } from "@app/lib/project_task/seed_initial_pod_tasks";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/assistant";
import type {
  FileSystemEntry,
  GetSpaceFilesResponseBody,
  PostExtractArchiveResponseBody,
} from "@app/types/api/file_system/types";
import type {
  GetPodMetadataResponseBody,
  PatchPodMetadataResponseBody,
} from "@app/types/api/projects/metadata";
import type {
  GetUserPodNotificationPreferenceResponseBody,
  PatchUserPodNotificationPreferenceResponseBody,
  PostUserPodStarResponseBody,
} from "@app/types/api/projects/preferences";
import type {
  GetPodTasksResponseBody,
  GetWorkspacePodTaskResponseBody,
  PatchPodTaskResponseBody,
  PostPodTaskResponseBody,
  PostStartPodTaskResponseBody,
} from "@app/types/api/projects/tasks";
import type {
  GetPodEgressPolicyResponseBody,
  PostPodEgressPolicyRequestResponseBody,
  PutPodEgressPolicyResponseBody,
} from "@app/types/api/sandbox/egress_policy";
import type {
  CheckNameResponseBody,
  GetSpaceResponseBody,
  PatchPodMetadataBodyType,
} from "@app/types/api/spaces";
import type {
  NotificationCondition,
  UserPodNotificationPreference,
} from "@app/types/notification_preferences";
import type { PodMetadataType } from "@app/types/project_metadata";
import type {
  PodTaskAssigneeType,
  PodTaskStatus,
  PodTaskType,
} from "@app/types/project_task";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { EMPTY_EGRESS_POLICY } from "@app/types/sandbox/egress_policy";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

export function usePodContextAttachments({
  owner,
  podId,
  query,
  disabled,
}: {
  owner: LightWorkspaceType;
  podId: string;
  query?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const podContextFetcher: Fetcher<GetProjectContextResponseBody> = fetcher;

  const key = useMemo(() => {
    const params = new URLSearchParams();
    if (query && query.trim().length > 0) {
      params.set("query", query);
    }
    const qs = params.toString();
    return `/api/w/${owner.sId}/spaces/${podId}/project_context${qs ? `?${qs}` : ""}`;
  }, [owner.sId, podId, query]);

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(key, podContextFetcher, { disabled });

  const refreshPodContextAttachments = useCallback(async () => {
    // Do not pass `undefined` as data — it clears the cache and causes UI flicker.
    await mutateRegardlessOfQueryParams();
  }, [mutateRegardlessOfQueryParams]);

  return {
    attachments: data?.attachments ?? [],
    isPodContextAttachmentsLoading: !disabled && !error && !data,
    isPodContextAttachmentsError: !!error,
    mutatePodContextAttachments: mutate,
    refreshPodContextAttachments,
  };
}

export function usePodFiles({
  owner,
  podId,
  disabled,
}: {
  owner: LightWorkspaceType;
  podId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const podFilesFetcher: Fetcher<GetSpaceFilesResponseBody> = fetcher;

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      !podId ? null : `/api/w/${owner.sId}/spaces/${podId}/files`,
      podFilesFetcher,
      { disabled: disabled || !podId, keepPreviousData: true }
    );

  const refreshPodFiles = useCallback(async () => {
    // Do not pass `undefined` as data — it clears the cache and causes UI flicker.
    await mutateRegardlessOfQueryParams();
  }, [mutateRegardlessOfQueryParams]);

  return {
    files: data?.files ?? emptyArray<FileSystemEntry>(),
    isPodFilesLoading: !disabled && !error && !data,
    isPodFilesError: !!error,
    mutatePodFiles: mutate,
    refreshPodFiles,
  };
}

export function useAddPodContextContentNodes({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  return async (
    items: ContentFragmentInputWithContentNode[]
  ): Promise<Result<PostPodContextContentNodeResponseBody, Error>> => {
    if (items.length === 0) {
      return new Ok({ contentFragments: [], errors: [] });
    }
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to add references to Pod`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostPodContextContentNodeResponseBody =
        await res.json();
      const addedCount = responseData.contentFragments.length;
      const errorCount = responseData.errors.length;
      if (errorCount === 0) {
        sendNotification({
          type: "success",
          title: t`${plural(addedCount, {
            one: "Added to Pod files",
            other: "Added # items to Pod files",
          })}`,
        });
      } else {
        sendNotification({
          type: "error",
          title: t`Some items could not be added`,
          description: t`${addedCount} added, ${errorCount} failed.`,
        });
      }

      return new Ok(responseData);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to add references to Pod`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useRemovePodContextContentNodes({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  return async (
    items: Array<{ nodeId: string; nodeDataSourceViewId: string }>
  ): Promise<Result<void, Error>> => {
    if (items.length === 0) {
      return new Ok(undefined);
    }
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_context/content_nodes`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to remove content nodes from Pod`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const removedCount = items.length;
      sendNotification({
        type: "success",
        title: t`${plural(removedCount, {
          one: "Removed from Pod files",
          other: "Removed # items from Pod files",
        })}`,
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to remove content nodes from Pod`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useCreatePodFolder({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  return async ({
    folderName,
    parentRelativePath = "",
  }: {
    folderName: string;
    parentRelativePath?: string;
  }): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/files`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderName, parentRelativePath }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to create folder`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: t`Folder "${folderName}" created`,
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to create folder`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useMovePodFile({ owner }: { owner: LightWorkspaceType }) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  return async ({
    srcCanonicalPath,
    destCanonicalPath,
  }: {
    /** Full canonical scoped path of the source file, e.g. `pod-{sId}/subdir/file.txt`. */
    srcCanonicalPath: string;
    /** Full canonical scoped path of the destination, e.g. `pod-{sId}/other/file.txt`. */
    destCanonicalPath: string;
  }): Promise<Result<void, Error>> => {
    try {
      const encoded = srcCanonicalPath
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const res = await clientFetch(
        `/api/w/${owner.sId}/files/path/${encoded}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "move", dest: destCanonicalPath }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to move file`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: t`File moved`,
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to move file`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useExtractPodArchive({ owner }: { owner: LightWorkspaceType }) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  return async ({
    archive,
    destCanonicalPath,
  }: {
    /** The ZIP file to expand. */
    archive: File;
    /** Canonical scoped path of the destination folder, e.g. `pod-{sId}/reports`. */
    destCanonicalPath: string;
  }): Promise<Result<void, Error>> => {
    const archiveName = archive.name;
    try {
      const encoded = destCanonicalPath
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const res = await clientFetch(
        `/api/w/${owner.sId}/files/path/${encoded}?action=extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/zip" },
          body: archive,
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to extract "${archiveName}"`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const { filesWritten }: PostExtractArchiveResponseBody = await res.json();
      sendNotification({
        type: "success",
        title: t`${plural(filesWritten, {
          one: `Extracted # file from "${archiveName}"`,
          other: `Extracted # files from "${archiveName}"`,
        })}`,
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to extract "${archiveName}"`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useCheckPodName({
  owner,
  initialName = "",
  whitelistedName,
}: {
  owner: LightWorkspaceType;
  initialName?: string;
  whitelistedName?: string;
}) {
  const { fetcher } = useFetcher();
  const {
    debouncedValue: debouncedName,
    isDebouncing,
    setValue,
  } = useDebounce(initialName, {
    delay: 300,
    minLength: 1,
  });

  // If the name matches the whitelisted name (case-insensitive), skip the API
  // call entirely — the name is available by definition (e.g. when renaming a
  // space to its current name).
  const isWhitelisted =
    !!whitelistedName &&
    debouncedName.trim().toLowerCase() === whitelistedName.trim().toLowerCase();

  const shouldFetch = useMemo(() => {
    return debouncedName.trim().length > 0 && !isWhitelisted;
  }, [debouncedName, isWhitelisted]);

  const checkKey = shouldFetch
    ? `/api/w/${owner.sId}/spaces/check-name?name=${encodeURIComponent(debouncedName)}`
    : null;

  const checkFetcher: Fetcher<CheckNameResponseBody> = fetcher;

  const { data, isLoading } = useSWRWithDefaults(checkKey, checkFetcher);

  return {
    isNameAvailable: isWhitelisted || (data?.available ?? true),
    isChecking: !isWhitelisted && (isLoading || isDebouncing),
    setValue,
  };
}

export function usePodTasks({
  owner,
  podId,
  disabled,
  taskOwnerFilter,
}: {
  owner: LightWorkspaceType;
  podId: string;
  disabled?: boolean;
  taskOwnerFilter: TaskOwnerFilter;
}) {
  const { fetcher } = useFetcher();
  const tasksFetcher: Fetcher<GetPodTasksResponseBody> = fetcher;
  const tasksUrl = useMemo(
    () => buildPodTasksListSwrKey(owner.sId, podId, taskOwnerFilter),
    [owner.sId, podId, taskOwnerFilter]
  );

  const { data, error, mutate } = useSWRWithDefaults(tasksUrl, tasksFetcher, {
    disabled,
  });

  const stableTaskOrderByAssigneeKeyRef = useRef<Map<string, string[]>>(
    new Map()
  );
  const stableOrderScopeKeyRef = useRef(`${owner.sId}:${podId}`);
  if (stableOrderScopeKeyRef.current !== `${owner.sId}:${podId}`) {
    stableOrderScopeKeyRef.current = `${owner.sId}:${podId}`;
    stableTaskOrderByAssigneeKeyRef.current = new Map();
  }

  const tasks = useMemo(() => {
    const raw = data?.tasks ?? emptyArray<PodTaskType>();
    const viewerUserId = data?.viewerUserId ?? null;
    if (raw.length === 0) {
      return raw;
    }
    return flattenPodTasksWithStableAssigneeOrder(
      raw,
      viewerUserId,
      stableTaskOrderByAssigneeKeyRef.current
    );
  }, [data?.tasks, data?.viewerUserId]);

  const sortedUsers = useMemo(() => {
    const usersById = new Map<string, PodTaskAssigneeType>();
    for (const task of data?.tasks ?? emptyArray<PodTaskType>()) {
      if (task.user) {
        usersById.set(task.user.sId, task.user);
      }
    }
    const users = [...usersById.values()];
    const viewerUserId = data?.viewerUserId ?? null;

    return [...users].sort((a, b) => {
      const aIsViewer = viewerUserId !== null && a.sId === viewerUserId;
      const bIsViewer = viewerUserId !== null && b.sId === viewerUserId;
      if (aIsViewer !== bIsViewer) {
        return aIsViewer ? -1 : 1;
      }
      return compareStrings(a.fullName, b.fullName, {
        sensitivity: "base",
      });
    });
  }, [data?.tasks, data?.viewerUserId]);

  return {
    tasks,
    lastReadAt: data?.lastReadAt ?? null,
    viewerUserId: data?.viewerUserId ?? null,
    users: sortedUsers,
    isTasksLoading: !disabled && !error && !data,
    isTasksError: !!error,
    mutateTasks: mutate,
  };
}

export function useMarkPodTasksRead({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { mutate } = useSWRConfig();

  return useCallback(async (): Promise<void> => {
    const immediateReadAt = new Date().toISOString();

    // Keep local UI state in sync immediately to avoid replaying new-item
    // animations when navigating away/back before the network round-trip ends.
    await mutate(
      (key) => isPodTasksListSwrKey(key, owner.sId, podId),
      (prev: GetPodTasksResponseBody | undefined) => ({
        tasks: prev?.tasks ?? [],
        viewerUserId: prev?.viewerUserId ?? null,
        lastReadAt: immediateReadAt,
      }),
      { revalidate: false }
    );

    try {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/mark_read`,
        { method: "POST" }
      );
    } catch {
      // Silent — mark_read is best-effort.
    }
  }, [mutate, owner.sId, podId]);
}

export function useSeedInitialPodTasks({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { mutate } = useSWRConfig();
  const [isSeeding, setIsSeeding] = useState(false);

  const seedInitialPodTasks = useCallback(async (): Promise<
    Result<PodTaskType[], Error>
  > => {
    setIsSeeding(true);
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/pods/${podId}/tasks/seed`,
        { method: "POST" }
      );

      if (res.status === 409) {
        await mutate((key) => isPodTasksListSwrKey(key, owner.sId, podId));
        return new Ok([]);
      }

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to set up starter tasks`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostSeedInitialPodTasksResponseBody =
        await res.json();
      await mutate((key) => isPodTasksListSwrKey(key, owner.sId, podId));
      return new Ok(responseData.tasks);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to set up starter tasks`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    } finally {
      setIsSeeding(false);
    }
  }, [mutate, owner.sId, sendApiErrorNotification, podId, t]);

  return { seedInitialPodTasks, isSeeding };
}

export function useCreatePodTask({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

  return async ({
    text,
    assigneeUserId,
  }: {
    text: string;
    assigneeUserId: string | null;
  }): Promise<Result<PodTaskType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, assigneeUserId }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to add task`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostPodTaskResponseBody = await res.json();
      return new Ok(responseData.task);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to add task`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useUpdatePodTask({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

  return async (
    taskId: string,
    updates: {
      text?: string;
      status?: PodTaskStatus;
      assigneeUserId?: string | null;
    }
  ): Promise<Result<PodTaskType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/${taskId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to update task`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PatchPodTaskResponseBody = await res.json();
      return new Ok(responseData.task);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to update task`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useDeletePodTask({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

  return async (taskId: string): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/${taskId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to delete task`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to delete task`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useStartPodTaskConversation({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

  return async (
    taskId: string,
    options?: { customMessage?: string; agentConfigurationId?: string }
  ): Promise<Result<PodTaskType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/${taskId}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customMessage: options?.customMessage,
            agentConfigurationId: options?.agentConfigurationId,
          }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to start task work`,
          error: errorData,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostStartPodTaskResponseBody = await res.json();
      return new Ok(responseData.task);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendApiErrorNotification({
        title: t`Failed to start task work`,
        error: e,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useWorkspacePodTask({
  workspaceId,
  taskId,
  disabled,
}: {
  workspaceId: string;
  taskId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const url = taskId
    ? `/api/w/${workspaceId}/project_tasks/${encodeURIComponent(taskId)}`
    : null;
  const podTaskFetcher: Fetcher<GetWorkspacePodTaskResponseBody> = fetcher;

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    url,
    podTaskFetcher,
    {
      disabled: disabled || !taskId,
    }
  );

  return {
    task: data?.task ?? null,
    pod: data?.space ?? null,
    isWorkspacePodTaskLoading: !disabled && !error && isLoading && !!taskId,
    isWorkspacePodTaskError: !!error,
    mutateWorkspacePodTask: mutate,
  };
}

export function useJoinPod({
  owner,
  podId,
  podName,
  userName,
}: {
  owner: LightWorkspaceType;
  podId: string;
  podName: string;
  userName: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutateSpaceInfoRegardlessOfQueryParams } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
    disabled: true,
  });
  const { mutate: mutatePodSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const doJoin = async (): Promise<boolean> => {
    const res = await clientFetch(`/api/w/${owner.sId}/spaces/${podId}/join`, {
      method: "POST",
    });

    if (res.ok) {
      void mutateSpaceInfoRegardlessOfQueryParams();
      void mutatePodSummary();
      sendNotification({
        type: "success",
        title: t`${userName} joined Pod ${podName}`,
        description: t`You can now participate in conversations.`,
      });
      return true;
    } else {
      const errorData = await getErrorFromResponse(res);
      sendApiErrorNotification({
        title: t`Could not join Pod`,
        error: errorData,
      });
      return false;
    }
  };

  return doJoin;
}

export function useLeavePod({
  owner,
  podId,
  podName,
  userName,
}: {
  owner: LightWorkspaceType;
  podId: string;
  podName: string;
  userName: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutateSpaceInfoRegardlessOfQueryParams } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
    disabled: true,
  });
  const { mutate: mutateSpaceSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const doLeave = async (): Promise<boolean> => {
    const res = await clientFetch(`/api/w/${owner.sId}/spaces/${podId}/leave`, {
      method: "POST",
    });

    if (res.ok) {
      void mutateSpaceInfoRegardlessOfQueryParams();
      void mutateSpaceSummary();
      sendNotification({
        type: "success",
        title: t`${userName} left Pod ${podName}`,
        description: t`You have successfully left the Pod.`,
      });
      return true;
    } else {
      const errorData = await getErrorFromResponse(res);
      sendApiErrorNotification({
        title: t`Could not leave Pod`,
        error: errorData,
      });
      return false;
    }
  };

  return doLeave;
}

export function usePodMetadata({
  workspaceId,
  podId,
  disabled = false,
}: {
  workspaceId: string;
  podId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const podMetadataFetcher: Fetcher<GetPodMetadataResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${podId}/project_metadata`,
    podMetadataFetcher,
    { disabled: disabled || podId === null }
  );

  return {
    podMetadata: data?.projectMetadata ?? null,
    defaultSkills: data?.defaultSkills ?? emptyArray(),
    isPodMetadataLoading: !error && !data && !disabled,
    isPodMetadataError: error,
    mutatePodMetadata: mutate,
  };
}

export function usePodDefaultSkills({
  owner,
  podId,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  podId: string;
  disabled?: boolean;
}) {
  const { defaultSkills, isPodMetadataLoading } = usePodMetadata({
    workspaceId: owner.sId,
    podId,
    disabled,
  });

  return {
    defaultSkills,
    isDefaultSkillsLoading: isPodMetadataLoading,
  };
}

export function useUpdatePodMetadata({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutatePodMetadata } = usePodMetadata({
    workspaceId: owner.sId,
    podId,
    disabled: true,
  });
  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  // `includeAllMembers: true` matches PodPage's live space-info key so
  // optimistic updates land in the cache the settings UI reads from.
  const { mutateSpaceInfo, mutateSpaceInfoRegardlessOfQueryParams } =
    useSpaceInfo({
      workspaceId: owner.sId,
      spaceId: podId,
      includeAllMembers: true,
      disabled: true,
    });

  return async (
    updates: PatchPodMetadataBodyType
  ): Promise<PodMetadataType | null> => {
    const url = `/api/w/${owner.sId}/spaces/${podId}/project_metadata`;

    const applyMutationOnSpace =
      updates.description !== undefined ||
      updates.pinnedFramePath !== undefined ||
      updates.frameTabs !== undefined ||
      updates.tabsOrder !== undefined ||
      updates.archive !== undefined;

    const applySpaceOptimistic = (
      data: GetSpaceResponseBody | undefined
    ): GetSpaceResponseBody | undefined => {
      if (!data) {
        return data;
      }
      return {
        ...data,
        space: {
          ...data.space,
          ...(updates.description !== undefined
            ? { description: updates.description }
            : {}),
          ...(updates.pinnedFramePath !== undefined
            ? { pinnedFramePath: updates.pinnedFramePath }
            : {}),
          ...(updates.frameTabs !== undefined
            ? { frameTabs: updates.frameTabs }
            : {}),
          ...(updates.tabsOrder !== undefined
            ? { tabsOrder: updates.tabsOrder }
            : {}),
          ...(updates.archive === true
            ? { archivedAt: data.space.archivedAt ?? Date.now() }
            : updates.archive === false
              ? { archivedAt: null }
              : {}),
        },
      };
    };

    const applySpaceFromMetadata = (
      data: GetSpaceResponseBody | undefined,
      metadata: PodMetadataType
    ): GetSpaceResponseBody | undefined => {
      if (!data) {
        return data;
      }
      return {
        ...data,
        space: {
          ...data.space,
          description: metadata.description,
          pinnedFramePath: metadata.pinnedFramePath,
          frameTabs: metadata.frameTabs,
          tabsOrder: metadata.tabsOrder,
          archivedAt: metadata.archivedAt,
        },
      };
    };

    const patchRequest = async (): Promise<PodMetadataType> => {
      const res = await clientFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Error updating Pod metadata`,
          error: errorData,
        });
        throw new Error(errorData.message);
      }

      const response: PatchPodMetadataResponseBody = await res.json();
      return response.projectMetadata;
    };

    try {
      let projectMetadata: PodMetadataType;

      if (applyMutationOnSpace) {
        // Official SWR optimistic update: write the pending space fields into
        // cache immediately, roll back on error, then populate from the PATCH.
        let patched: PodMetadataType | null = null;
        await mutateSpaceInfo(
          async (current) => {
            patched = await patchRequest();
            void mutatePodMetadata(
              (current) =>
                current ? { ...current, projectMetadata: patched } : current,
              { revalidate: updates.defaultSkillIds !== undefined }
            );
            return applySpaceFromMetadata(current, patched);
          },
          {
            optimisticData: (current) =>
              applySpaceOptimistic(current) as GetSpaceResponseBody,
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          }
        );
        if (!patched) {
          return null;
        }
        projectMetadata = patched;
        // Refresh any other space-info query-param variants (not the live key —
        // we already populated it above).
        void mutateSpaceInfoRegardlessOfQueryParams();
      } else {
        projectMetadata = await patchRequest();
        void mutatePodMetadata(
          (current) => (current ? { ...current, projectMetadata } : current),
          { revalidate: updates.defaultSkillIds !== undefined }
        );
        void mutateSpaceInfoRegardlessOfQueryParams();
      }

      void mutatePodConversationsSummary();

      const title =
        updates.frameTabs !== undefined || updates.tabsOrder !== undefined
          ? updates.frameTabs?.length === 0
            ? t`Pod tabs cleared`
            : t`Pod tabs updated`
          : updates.pinnedFramePath !== undefined
            ? updates.pinnedFramePath
              ? t`Frame pinned as Pod banner`
              : t`Banner unpinned`
            : updates.archive !== undefined
              ? updates.archive
                ? t`Pod archived`
                : t`Pod unarchived`
              : t`Pod updated`;

      sendNotification({
        type: "success",
        title,
      });

      return projectMetadata;
    } catch {
      return null;
    }
  };
}

export function usePodNotificationPreference({
  workspaceId,
  podId,
  disabled = false,
}: {
  workspaceId: string;
  podId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const podMetadataFetcher: Fetcher<GetUserPodNotificationPreferenceResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${podId}/project_notification_preferences`,
    podMetadataFetcher,
    { disabled: disabled || podId === null }
  );

  return {
    podNotificationPreference: data?.userProjectNotificationPreference ?? null,
    isPodNotificationPreferenceLoading: !error && !data && !disabled,
    mutatePodNotificationPreference: mutate,
  };
}

export function useUpdatePodNotificationPreference({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string | null;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutatePodNotificationPreference } = usePodNotificationPreference({
    workspaceId,
    podId,
    disabled: true,
  });

  return async (
    preference: NotificationCondition
  ): Promise<UserPodNotificationPreference | null> => {
    if (!podId) {
      return null;
    }
    const url = `/api/w/${workspaceId}/spaces/${podId}/project_notification_preferences`;

    const res = await clientFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preference,
      }),
    });

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendApiErrorNotification({
        title: t`Error updating Pod notification preference`,
        error: errorData,
      });
      return null;
    }

    void mutatePodNotificationPreference();

    sendNotification({
      type: "success",
      title: t`Pod notification preference updated`,
    });

    const response: PatchUserPodNotificationPreferenceResponseBody =
      await res.json();
    return response.userProjectNotificationPreference;
  };
}

export function useStarPod({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string | null;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
    workspaceId,
    options: { disabled: true },
  });

  return useCallback(
    async (isStarred: boolean): Promise<PostUserPodStarResponseBody | null> => {
      if (!podId) {
        return null;
      }

      const res = await clientFetch(
        `/api/w/${workspaceId}/spaces/${podId}/star`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ starred: isStarred }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: isStarred ? t`Error starring Pod` : t`Error unstarring Pod`,
          error: errorData,
        });
        return null;
      }

      const response: PostUserPodStarResponseBody = await res.json();

      void mutatePodConversationsSummary((data) => {
        if (!data) {
          return data;
        }
        return {
          ...data,
          summary: data.summary.map((entry) =>
            entry.space.sId === podId
              ? {
                  ...entry,
                  space: { ...entry.space, isStarred: response.isStarred },
                }
              : entry
          ),
        };
      }, false);

      return response;
    },
    [
      workspaceId,
      podId,
      mutatePodConversationsSummary,
      sendApiErrorNotification,
      t,
    ]
  );
}

function podEgressPolicyUrl(workspaceId: string, podId: string) {
  return `/api/w/${workspaceId}/spaces/${podId}/sandbox/egress-policy`;
}

export function usePodEgressPolicy({
  owner,
  podId,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  podId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const policyFetcher: Fetcher<GetPodEgressPolicyResponseBody> = fetcher;
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    podEgressPolicyUrl(owner.sId, podId),
    policyFetcher,
    { disabled }
  );

  return {
    policy: data?.policy ?? EMPTY_EGRESS_POLICY,
    requestedDomains: data?.requestedDomains ?? emptyArray(),
    isPodEgressPolicyLoading: disabled ? false : isLoading,
    isPodEgressPolicyError: !!error,
    mutatePodEgressPolicy: mutate,
  };
}

export function useUpdatePodEgressPolicy({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isUpdatingPodEgressPolicy, setIsUpdating] = useState(false);
  const { mutatePodEgressPolicy } = usePodEgressPolicy({
    owner,
    podId,
    disabled: true,
  });

  const updatePodEgressPolicy = async (
    policy: EgressPolicy
  ): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const response = await clientFetch(podEgressPolicyUrl(owner.sId, podId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendApiErrorNotification({
          title: t`Failed to update Pod network policy`,
          error,
        });
        return false;
      }

      const data: PutPodEgressPolicyResponseBody = await response.json();
      // Keep requestedDomains, or the other pending rows vanish until refetch.
      await mutatePodEgressPolicy(
        {
          policy: data.policy,
          requestedDomains: (data.policy.requestedDomains ?? []).map(
            ({ domain: d, requestedAtMs }) => ({ domain: d, requestedAtMs })
          ),
        },
        false
      );
      sendNotification({
        type: "success",
        title: t`Pod network policy updated`,
        description: t`Sandbox egress policy changes will be applied by the proxy cache shortly.`,
      });
      return true;
    } catch {
      sendNotification({
        type: "error",
        title: t`Failed to update Pod network policy`,
        description: t`An unexpected error occurred. Please try again.`,
      });
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { updatePodEgressPolicy, isUpdatingPodEgressPolicy };
}

export function useDismissPodEgressRequest({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isDismissingRequest, setIsDismissing] = useState(false);
  const { mutatePodEgressPolicy } = usePodEgressPolicy({
    owner,
    podId,
    disabled: true,
  });

  const dismissPodEgressRequest = async (domain: string): Promise<boolean> => {
    setIsDismissing(true);
    try {
      const response = await clientFetch(
        `${podEgressPolicyUrl(owner.sId, podId)}/requests/dismiss`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendApiErrorNotification({
          title: t`Failed to reject domain request`,
          error,
        });
        return false;
      }

      const data: PutPodEgressPolicyResponseBody = await response.json();
      await mutatePodEgressPolicy(
        {
          policy: data.policy,
          requestedDomains: (data.policy.requestedDomains ?? []).map(
            ({ domain: d, requestedAtMs }) => ({ domain: d, requestedAtMs })
          ),
        },
        false
      );
      return true;
    } catch {
      sendNotification({
        type: "error",
        title: t`Failed to reject domain request`,
        description: t`An unexpected error occurred. Please try again.`,
      });
      return false;
    } finally {
      setIsDismissing(false);
    }
  };

  return { dismissPodEgressRequest, isDismissingRequest };
}

// Lets a Pod member request a domain (recorded for admin review, never
// granted).
export function useRequestPodEgressDomain({
  owner,
  podId,
}: {
  owner: LightWorkspaceType;
  podId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isRequestingPodEgressDomain, setIsRequesting] = useState(false);
  const { mutatePodEgressPolicy } = usePodEgressPolicy({
    owner,
    podId,
    disabled: true,
  });

  const requestPodEgressDomain = async (domain: string): Promise<boolean> => {
    setIsRequesting(true);
    try {
      const response = await clientFetch(
        `${podEgressPolicyUrl(owner.sId, podId)}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendApiErrorNotification({
          title: t`Failed to request domain`,
          error,
        });
        return false;
      }

      const data: PostPodEgressPolicyRequestResponseBody =
        await response.json();
      await mutatePodEgressPolicy(
        {
          policy: data.policy,
          requestedDomains: (data.policy.requestedDomains ?? []).map(
            ({ domain: d, requestedAtMs }) => ({ domain: d, requestedAtMs })
          ),
        },
        false
      );
      sendNotification({
        type: "success",
        title:
          data.outcome === "already_allowed"
            ? t`Domain already allowed`
            : data.outcome === "already_requested"
              ? t`Domain already requested`
              : t`Domain requested`,
        description:
          data.outcome === "requested"
            ? t`A workspace admin will review your request.`
            : data.outcome === "already_allowed"
              ? t`${domain} is already allowed for this Pod.`
              : t`${domain} is already pending review for this Pod.`,
      });
      return true;
    } catch {
      sendNotification({
        type: "error",
        title: t`Failed to request domain`,
        description: t`An unexpected error occurred. Please try again.`,
      });
      return false;
    } finally {
      setIsRequesting(false);
    }
  };

  return { requestPodEgressDomain, isRequestingPodEgressDomain };
}
