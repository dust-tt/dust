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
import type {
  GetProjectTodosResponseBody,
  PostProjectTodoResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";
import type { CheckNameResponseBody } from "@app/pages/api/w/[wId]/spaces/check-name";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type {
  ProjectTodoCategory,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

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
}: {
  owner: LightWorkspaceType;
  initialName?: string;
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

  const shouldFetch = useMemo(() => {
    return debouncedName.trim().length > 0;
  }, [debouncedName]);

  const checkKey = shouldFetch
    ? `/api/w/${owner.sId}/spaces/check-name?name=${encodeURIComponent(debouncedName)}`
    : null;

  const checkFetcher: Fetcher<CheckNameResponseBody> = fetcher;

  const { data, isLoading } = useSWRWithDefaults(checkKey, checkFetcher);

  return {
    isNameAvailable: data?.available ?? true,
    isChecking: isLoading || isDebouncing,
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

  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : `/api/w/${owner.sId}/spaces/${spaceId}/project_todos`,
    todosFetcher
  );

  return {
    todos: data?.todos ?? [],
    isTodosLoading: !disabled && !error && !data,
    isTodosError: !!error,
    mutateTodos: mutate,
  };
}

export function useCreateProjectTodo({
  owner,
  spaceId,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();

  return async (
    category: ProjectTodoCategory,
    text: string
  ): Promise<Result<ProjectTodoType, Error>> => {
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, text }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to create todo",
          description: errorData.message,
        });
        return new Err(new Error(errorData.message));
      }

      const responseData: PostProjectTodoResponseBody = await res.json();
      return new Ok(responseData.todo);
    } catch (e) {
      const errorMessage = normalizeError(e).message;
      sendNotification({
        type: "error",
        title: "Failed to create todo",
        description: errorMessage,
      });
      return new Err(new Error(errorMessage));
    }
  };
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
