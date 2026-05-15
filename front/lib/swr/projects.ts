import {
  buildProjectTasksListSwrKey,
  isProjectTasksListSwrKey,
  type TaskOwnerFilter,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { useDebounce } from "@app/hooks/useDebounce";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { flattenProjectTasksWithStableAssigneeOrder } from "@app/lib/project_task/display_order";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GCSMountEntry,
  GetSpaceFilesResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/files";
import type {
  GetProjectContextResponseBody,
  PostProjectContextContentNodeResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_context";
import type { PatchProjectTaskResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_tasks/[taskId]/index";
import type { PostStartProjectTaskResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_tasks/[taskId]/start";
import type { BulkActionsResponse } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_tasks/bulk-actions";
import type {
  GetProjectTasksResponseBody,
  PostProjectTaskResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_tasks/index";
import type { CheckNameResponseBody } from "@app/pages/api/w/[wId]/spaces/check-name";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type {
  ProjectTaskAssigneeType,
  ProjectTaskStatus,
  ProjectTaskType,
} from "@app/types/project_task";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useRef } from "react";
import { type Fetcher, useSWRConfig } from "swr";

export function useProjectContextAttachments({
  owner,
  spaceId,
  query,
  disabled,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  query?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const projectContextFetcher: Fetcher<GetProjectContextResponseBody> = fetcher;

  const key = useMemo(() => {
    if (disabled) {
      return null;
    }
    const params = new URLSearchParams();
    if (query && query.trim().length > 0) {
      params.set("query", query);
    }
    const qs = params.toString();
    return `/api/w/${owner.sId}/spaces/${spaceId}/project_context${qs ? `?${qs}` : ""}`;
  }, [disabled, owner.sId, spaceId, query]);

  const { data, error, mutate } = useSWRWithDefaults(
    key,
    projectContextFetcher
  );

  return {
    attachments: data?.attachments ?? [],
    isProjectContextAttachmentsLoading: !disabled && !error && !data,
    isProjectContextAttachmentsError: !!error,
    mutateProjectContextAttachments: mutate,
  };
}

export function useProjectFiles({
  owner,
  spaceId,
  disabled,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const projectFilesFetcher: Fetcher<GetSpaceFilesResponseBody> = fetcher;

  const key = disabled
    ? null
    : `/api/w/${owner.sId}/spaces/${spaceId}/files`;

  const { data, error, mutate } = useSWRWithDefaults(key, projectFilesFetcher);

  return {
    files: data?.files ?? emptyArray<GCSMountEntry>(),
    isProjectFilesLoading: !disabled && !error && !data,
    isProjectFilesError: !!error,
    mutateProjectFiles: mutate,
  };
}

export type ProjectContextContentNodeFragment =
  PostProjectContextContentNodeResponseBody["contentFragment"];

export function useAddProjectContextContentNode({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    contentFragment: ContentFragmentInputWithContentNode
  ): Promise<Result<ProjectContextContentNodeFragment, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contentFragment),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to add reference to project",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostProjectContextContentNodeResponseBody =
        await res.json();
      sendNotification({
        type: "success",
        title: "Added to project context",
      });

      return new Ok(responseData.contentFragment);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to add reference to project",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useRemoveProjectContextFile({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (fileId: string): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_context/files/${fileId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to remove file from project",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: "Removed from project knowledge",
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to remove file from project",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useRemoveProjectContextContentNode({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async ({
    nodeId,
    nodeDataSourceViewId,
  }: {
    nodeId: string;
    nodeDataSourceViewId: string;
  }): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_context/content_nodes`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId, nodeDataSourceViewId }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to remove content node from project",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: "Removed from project knowledge",
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to remove content node from project",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useRenameProjectFile({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();

  return async (
    fileId: string,
    fileName: string
  ): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/files/${fileId}/rename`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileName }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to rename file",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      sendNotification({
        type: "success",
        title: `File renamed to "${fileName}"`,
      });

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to rename file",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useCheckProjectName({
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

export function useProjectTasks({
  owner,
  spaceId,
  disabled,
  taskOwnerFilter,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  disabled?: boolean;
  taskOwnerFilter: TaskOwnerFilter;
}) {
  const { fetcher } = useFetcher();
  const tasksFetcher: Fetcher<GetProjectTasksResponseBody> = fetcher;
  const tasksUrl = useMemo(
    () =>
      disabled
        ? null
        : buildProjectTasksListSwrKey(owner.sId, spaceId, taskOwnerFilter),
    [disabled, owner.sId, spaceId, taskOwnerFilter]
  );

  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : tasksUrl,
    tasksFetcher
  );

  const stableTaskOrderByAssigneeKeyRef = useRef<Map<string, string[]>>(
    new Map()
  );
  const stableOrderScopeKeyRef = useRef(`${owner.sId}:${spaceId}`);
  if (stableOrderScopeKeyRef.current !== `${owner.sId}:${spaceId}`) {
    stableOrderScopeKeyRef.current = `${owner.sId}:${spaceId}`;
    stableTaskOrderByAssigneeKeyRef.current = new Map();
  }

  const tasks = useMemo(() => {
    const raw = data?.tasks ?? emptyArray<ProjectTaskType>();
    const viewerUserId = data?.viewerUserId ?? null;
    if (raw.length === 0) {
      return raw;
    }
    return flattenProjectTasksWithStableAssigneeOrder(
      raw,
      viewerUserId,
      stableTaskOrderByAssigneeKeyRef.current
    );
  }, [data?.tasks, data?.viewerUserId]);

  const sortedUsers = useMemo(() => {
    const usersById = new Map<string, ProjectTaskAssigneeType>();
    for (const task of data?.tasks ?? emptyArray<ProjectTaskType>()) {
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
      return a.fullName.localeCompare(b.fullName, undefined, {
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

export function useMarkProjectTasksRead({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const { mutate } = useSWRConfig();

  return useCallback(async (): Promise<void> => {
    const immediateReadAt = new Date().toISOString();

    // Keep local UI state in sync immediately to avoid replaying new-item
    // animations when navigating away/back before the network round-trip ends.
    await mutate(
      (key) => isProjectTasksListSwrKey(key, owner.sId, spaceId),
      (prev: GetProjectTasksResponseBody | undefined) => ({
        tasks: prev?.tasks ?? [],
        viewerUserId: prev?.viewerUserId ?? null,
        lastReadAt: immediateReadAt,
      }),
      { revalidate: false }
    );

    try {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/mark_read`,
        { method: "POST" }
      );
    } catch {
      // Silent — mark_read is best-effort.
    }
  }, [mutate, owner.sId, spaceId]);
}

export function useCreateProjectTask({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async ({
    text,
    assigneeUserId,
  }: {
    text: string;
    assigneeUserId: string | null;
  }): Promise<Result<ProjectTaskType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, assigneeUserId }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to add task",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostProjectTaskResponseBody = await res.json();
      return new Ok(responseData.task);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to add task",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useUpdateProjectTask({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    taskId: string,
    updates: {
      text?: string;
      status?: ProjectTaskStatus;
      assigneeUserId?: string | null;
    }
  ): Promise<Result<ProjectTaskType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/${taskId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to update task",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PatchProjectTaskResponseBody = await res.json();
      return new Ok(responseData.task);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to update task",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useBulkUpdateProjectTaskStatus({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    taskIds: string[],
    status: ProjectTaskStatus
  ): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_status", taskIds, status }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to update tasks",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const data: BulkActionsResponse = await res.json();
      if (!data.success) {
        return new Err(new Error("Failed to update tasks"));
      }
      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to update tasks",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useDeleteProjectTask({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (taskId: string): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/${taskId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to delete task",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to delete task",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useStartProjectTaskConversation({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    taskId: string,
    options?: { customMessage?: string; agentConfigurationId?: string }
  ): Promise<Result<ProjectTaskType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/${taskId}/start`,
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
        sendNotification({
          type: "error",
          title: "Failed to start task work",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostStartProjectTaskResponseBody = await res.json();
      return new Ok(responseData.task);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to start task work",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}
