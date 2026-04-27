import { useDebounce } from "@app/hooks/useDebounce";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetProjectContextResponseBody,
  PostProjectContextContentNodeResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_context";
import type { PatchProjectTodoResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/[todoId]/index";
import type { PostStartProjectTodoResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/[todoId]/start";
import type { BulkActionsResponse } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/bulk-actions";
import type { GetProjectTodosResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";
import type { CheckNameResponseBody } from "@app/pages/api/w/[wId]/spaces/check-name";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type {
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import { type Fetcher, useSWRConfig } from "swr";

export function useProjectContextAttachments({
  owner,
  spaceId,
  query,
  type,
  disabled,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  query?: string;
  type?: "file" | "content-node";
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
    if (type) {
      params.set("type", type);
    }
    const qs = params.toString();
    return `/api/w/${owner.sId}/spaces/${spaceId}/project_context${qs ? `?${qs}` : ""}`;
  }, [disabled, owner.sId, spaceId, query, type]);

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

export function useProjectTodos({
  owner,
  spaceId,
  disabled,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const todosFetcher: Fetcher<GetProjectTodosResponseBody> = fetcher;
  const todosUrl = useMemo(
    () => `/api/w/${owner.sId}/spaces/${spaceId}/project_todos`,
    [owner.sId, spaceId]
  );

  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : todosUrl,
    todosFetcher
  );

  return {
    todos: data?.todos ?? [],
    lastReadAt: data?.lastReadAt ?? null,
    viewerUserId: data?.viewerUserId ?? null,
    users: data?.users ?? [],
    isTodosLoading: !disabled && !error && !data,
    isTodosError: !!error,
    mutateTodos: mutate,
  };
}

export function useMarkProjectTodosRead({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const { mutate } = useSWRConfig();

  return useCallback(async (): Promise<void> => {
    const immediateReadAt = new Date().toISOString();
    const todosKey = `/api/w/${owner.sId}/spaces/${spaceId}/project_todos`;

    // Keep local UI state in sync immediately to avoid replaying new-item
    // animations when navigating away/back before the network round-trip ends.
    await mutate(
      todosKey,
      (prev: GetProjectTodosResponseBody | undefined) => ({
        todos: prev?.todos ?? [],
        users: prev?.users ?? [],
        viewerUserId: prev?.viewerUserId ?? null,
        lastReadAt: immediateReadAt,
      }),
      { revalidate: false }
    );

    try {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/mark_read`,
        { method: "POST" }
      );
    } catch {
      // Silent — mark_read is best-effort.
    }
  }, [mutate, owner.sId, spaceId]);
}

export function useUpdateProjectTodo({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    todoId: string,
    updates: { text?: string; status?: ProjectTodoStatus }
  ): Promise<Result<ProjectTodoType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/${todoId}`,
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
          title: "Failed to update todo",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PatchProjectTodoResponseBody = await res.json();
      return new Ok(responseData.todo);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to update todo",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useBulkUpdateProjectTodoStatus({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    todoIds: string[],
    status: ProjectTodoStatus
  ): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_status", todoIds, status }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to update todos",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const data: BulkActionsResponse = await res.json();
      if (!data.success) {
        return new Err(new Error("Failed to update todos"));
      }
      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to update todos",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useDeleteProjectTodo({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (todoId: string): Promise<Result<void, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/${todoId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to delete todo",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      return new Ok(undefined);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to delete todo",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useStartProjectTodoConversation({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (todoId: string): Promise<Result<ProjectTodoType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/${todoId}/start`,
        { method: "POST" }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to start todo work",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostStartProjectTodoResponseBody = await res.json();
      return new Ok(responseData.todo);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to start todo work",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}

export function useCleanDoneProjectTodos({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (): Promise<Result<{ cleanedCount: number }, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clean_done" }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to clean done todos",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const data: BulkActionsResponse = await res.json();
      return new Ok({ cleanedCount: data.cleanedCount ?? 0 });
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to clean done todos",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
}
