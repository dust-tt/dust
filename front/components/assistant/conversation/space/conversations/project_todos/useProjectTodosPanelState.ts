import {
  groupedTodosNonPendingSuggestions,
  groupedTodosPendingSuggestionsOnly,
} from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosDataTable";
import type {
  ProjectTodosPanelData,
  UseProjectTodosPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosPanelTypes";
import {
  formatTodoScopeLabel,
  useAgentNameById,
} from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import {
  DELETE_TODO_CONFIRM_PREVIEW_MAX_CHARS,
  isOnboardingTodo,
  SUMMARY_ITEM_TRANSITION_MS,
} from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { ConfirmContext } from "@app/components/Confirm";
import {
  useSpaceConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useTodoDiffAnimations } from "@app/hooks/useTodoDiffAnimations";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { compareProjectTodoAssigneeGroups } from "@app/lib/project_todo/display_order";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useBulkUpdateProjectTodoStatus,
  useCleanDoneProjectTodos,
  useCreateProjectTodo,
  useDeleteProjectTodo,
  useMarkProjectTodosRead,
  useProjectTodos,
  useStartProjectTodoConversation,
  useUpdateProjectTodo,
} from "@app/lib/swr/projects";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { removeDiacritics } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { GetProjectTodosResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type {
  ProjectTodoAssigneeType,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

export function useProjectTodosPanelState({
  owner,
  spaceId,
  isReadOnly,
  todoOwnerFilter,
  onTodoOwnerFilterChange,
}: UseProjectTodosPanelArgs): ProjectTodosPanelData {
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const {
    todos,
    users,
    viewerUserId,
    lastReadAt,
    isTodosLoading,
    mutateTodos,
  } = useProjectTodos({
    owner,
    spaceId,
  });
  const agentNameById = useAgentNameById(owner);
  const doUpdate = useUpdateProjectTodo({ owner, spaceId });
  const doBulkUpdateStatus = useBulkUpdateProjectTodoStatus({ owner, spaceId });
  const doDelete = useDeleteProjectTodo({ owner, spaceId });
  const doStartConversation = useStartProjectTodoConversation({
    owner,
    spaceId,
  });
  const doCleanDone = useCleanDoneProjectTodos({ owner, spaceId });
  const markRead = useMarkProjectTodosRead({ owner, spaceId });
  const doCreateTodo = useCreateProjectTodo({ owner, spaceId });
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });
  const confirm = useContext(ConfirmContext);
  const router = useAppRouter();

  const { mutateConversations: mutateSpaceConversations } =
    useSpaceConversations({
      workspaceId: owner.sId,
      spaceId,
      options: { disabled: true },
    });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(
    new Set()
  );
  const [isCleaning, setIsCleaning] = useState(false);
  const [startingTodoIds, setStartingTodoIds] = useState<Set<string>>(
    new Set()
  );
  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
      disabled: isTodosLoading,
    });
  const activeAgents = useMemo(() => {
    const agents = agentConfigurations.filter((a) => a.status === "active");
    agents.sort(compareAgentsForSort);
    return agents;
  }, [agentConfigurations]);

  const projectMembers = useMemo(() => {
    const members = spaceInfo?.members ?? [];
    return [...members].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" })
    );
  }, [spaceInfo?.members]);

  const membersWithActiveTodoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const todo of todos) {
      if (todo.status !== "done" && todo.user?.sId) {
        ids.add(todo.user.sId);
      }
    }
    return ids;
  }, [todos]);

  const defaultNewAssigneeSId = useMemo(() => {
    if (projectMembers.length === 0) {
      return null;
    }
    if (viewerUserId && projectMembers.some((m) => m.sId === viewerUserId)) {
      return viewerUserId;
    }
    return projectMembers[0]!.sId;
  }, [projectMembers, viewerUserId]);

  // ── Diff animation state ────────────────────────────────────────────────────

  // Frozen snapshot of lastReadAt taken on first successful load. undefined =
  // not yet captured; null = first-ever visit; string = ISO timestamp.
  // Initialized synchronously so new items start hidden from the very first
  // render with data — prevents a layout shift on unchanged items caused by
  // transitioning new items from visible→hidden after the first paint.
  const [frozenLastReadAt, setFrozenLastReadAt] = useState<
    string | null | undefined
  >(() => (!isTodosLoading ? lastReadAt : undefined));

  useEffect(() => {
    if (!isTodosLoading && frozenLastReadAt === undefined) {
      setFrozenLastReadAt(lastReadAt);
    }
  }, [isTodosLoading, frozenLastReadAt, lastReadAt]);

  const { newItemKeys, doneFlashKeys } = useTodoDiffAnimations({
    ledgerScopeKey: `${owner.sId}:${spaceId}`,
    todos,
    frozenLastReadAt,
    isTodosLoading,
    markRead,
  });

  const usersBySId = useMemo(
    () => new Map(users.map((user) => [user.sId, user])),
    [users]
  );
  const selectedUserSIds = useMemo(
    () => new Set(todoOwnerFilter.selectedUserSIds),
    [todoOwnerFilter.selectedUserSIds]
  );
  const filteredUsers = useMemo(() => {
    const q = removeDiacritics(assigneeSearch.trim()).toLowerCase();
    if (!q) {
      return users;
    }

    return users.filter((user) =>
      removeDiacritics(user.fullName).toLowerCase().includes(q)
    );
  }, [assigneeSearch, users]);
  const todoScopeLabel = formatTodoScopeLabel({
    scope: todoOwnerFilter.assigneeScope,
    selectedUserSIds,
    usersBySId,
    viewerUserId,
  });

  const filteredTodos = useMemo(() => {
    switch (todoOwnerFilter.assigneeScope) {
      case "all":
        return todos;
      case "mine":
        if (viewerUserId === null) {
          return [];
        }
        return todos.filter((todo) => todo.user?.sId === viewerUserId);
      case "users":
        if (selectedUserSIds.size === 0) {
          return todos;
        }
        return todos.filter(
          (todo) => !!todo.user?.sId && selectedUserSIds.has(todo.user.sId)
        );
    }
  }, [selectedUserSIds, todoOwnerFilter.assigneeScope, todos, viewerUserId]);

  const hasDoneItems = filteredTodos.some((todo) => todo.status === "done");

  const getFirstOnboardingTodoId = (
    todos: ProjectTodoType[]
  ): string | null => {
    for (const todo of todos) {
      if (isOnboardingTodo(todo) && todo.status !== "done") {
        return todo.sId;
      }
    }
    return null;
  };
  const firstOnboardingTodoId = getFirstOnboardingTodoId(filteredTodos);

  const groupedTodosForAll = useMemo(() => {
    const groups = new Map<
      string,
      { user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }
    >();

    for (const todo of filteredTodos) {
      const user = todo.user ?? null;
      const key = user?.sId ?? `unknown-${todo.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.todos.push(todo);
      } else {
        groups.set(key, { user, todos: [todo] });
      }
    }

    return [...groups.values()].sort((a, b) =>
      compareProjectTodoAssigneeGroups(a, b, viewerUserId)
    );
  }, [filteredTodos, viewerUserId]);

  const groupedSuggestedTodosOnly = useMemo(
    () => groupedTodosPendingSuggestionsOnly(groupedTodosForAll),
    [groupedTodosForAll]
  );

  const groupedRegularTodosOnly = useMemo(
    () => groupedTodosNonPendingSuggestions(groupedTodosForAll),
    [groupedTodosForAll]
  );

  // Optimistically update a todo's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (todo: ProjectTodoType, status: ProjectTodoStatus) => {
      const optimistic = (prev: GetProjectTodosResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
        viewerUserId: prev?.viewerUserId ?? viewerUserId,
        todos: (prev?.todos ?? []).map((t) =>
          t.sId === todo.sId ? { ...t, status } : t
        ),
      });

      void mutateTodos(optimistic, { revalidate: false });

      const result = await doUpdate(todo.sId, { status });
      if (result.isErr()) {
        void mutateTodos();
      }
    },
    [doUpdate, mutateTodos, viewerUserId]
  );

  const handleToggleDone = useCallback(
    (todo: ProjectTodoType) => {
      if (todo.status === "done") {
        void handleSetStatus(todo, "todo");
      } else {
        void handleSetStatus(todo, "done");
      }
    },
    [handleSetStatus]
  );

  const onApproveAgentSuggestion = useCallback(
    async (todo: ProjectTodoType) => {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_agent_suggestion",
            todoIds: [todo.sId],
          }),
        }
      );
      await mutateTodos();
    },
    [owner.sId, spaceId, mutateTodos]
  );

  const onRejectAgentSuggestion = useCallback(
    async (todo: ProjectTodoType) => {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject_agent_suggestion",
            todoIds: [todo.sId],
          }),
        }
      );
      await mutateTodos();
    },
    [owner.sId, spaceId, mutateTodos]
  );

  const onApproveAllSuggestedForAssignee = useCallback(
    async (todoIds: string[]) => {
      if (todoIds.length === 0) {
        return;
      }
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_agent_suggestion",
            todoIds,
          }),
        }
      );
      await mutateTodos();
    },
    [owner.sId, spaceId, mutateTodos]
  );

  const onRejectAllSuggestedForAssignee = useCallback(
    async (todoIds: string[]) => {
      if (todoIds.length === 0) {
        return;
      }
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_todos/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject_agent_suggestion",
            todoIds,
          }),
        }
      );
      await mutateTodos();
    },
    [owner.sId, spaceId, mutateTodos]
  );

  const patchTodoItem = useCallback(
    async (
      todoId: string,
      updates: { text?: string; assigneeUserId?: string }
    ) => {
      const result = await doUpdate(todoId, updates);
      if (result.isErr()) {
        throw result.error;
      }
      const updated = result.value;
      void mutateTodos(
        (prev: GetProjectTodosResponseBody | undefined) => ({
          lastReadAt: prev?.lastReadAt ?? null,
          viewerUserId: prev?.viewerUserId ?? viewerUserId,
          todos: (prev?.todos ?? []).map((t) =>
            t.sId === todoId
              ? {
                  ...updated,
                  sources: t.sources,
                  conversationSidebarStatus:
                    t.conversationSidebarStatus ??
                    updated.conversationSidebarStatus,
                }
              : t
          ),
        }),
        { revalidate: false }
      );
    },
    [doUpdate, mutateTodos, viewerUserId]
  );

  // Bulk set the status of every todo in a category in a single request.
  // Optimistically updates the SWR cache, then revalidates on failure.
  const _handleSetStatusForSection = useCallback(
    async (status: ProjectTodoStatus) => {
      const targetIds = todos
        .filter((t) => t.status !== status)
        .map((t) => t.sId);

      if (targetIds.length === 0) {
        return;
      }

      const targetIdSet = new Set(targetIds);
      const optimistic = (prev: GetProjectTodosResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
        viewerUserId: prev?.viewerUserId ?? viewerUserId,
        todos: (prev?.todos ?? []).map((t) =>
          targetIdSet.has(t.sId) ? { ...t, status } : t
        ),
      });

      void mutateTodos(optimistic, { revalidate: false });

      const result = await doBulkUpdateStatus(targetIds, status);
      if (result.isErr()) {
        void mutateTodos();
      }
    },
    [doBulkUpdateStatus, mutateTodos, todos, viewerUserId]
  );

  const handleClean = useCallback(async () => {
    setIsCleaning(true);

    const doneSIds = new Set(
      todos.filter((t) => t.status === "done").map((t) => t.sId)
    );
    setPendingRemovalIds(doneSIds);

    const result = await doCleanDone();

    if (result.isOk()) {
      // Wait for exit animations to finish, then refresh the server data.
      // pendingRemovalIds is cleared only after mutateTodos resolves so items
      // don't briefly reappear from the stale SWR cache and re-trigger the
      // exit animation.
      setTimeout(async () => {
        await mutateTodos();
        setPendingRemovalIds(new Set());
        setIsCleaning(false);
      }, SUMMARY_ITEM_TRANSITION_MS);
    } else {
      setPendingRemovalIds(new Set());
      setIsCleaning(false);
    }
  }, [doCleanDone, todos, mutateTodos]);

  const handleDelete = useCallback(
    async (todo: ProjectTodoType) => {
      const result = await doDelete(todo.sId);
      if (result.isOk()) {
        void mutateTodos();
      }
    },
    [doDelete, mutateTodos]
  );

  const requestDelete = useCallback(
    async (todo: ProjectTodoType) => {
      const preview =
        todo.text.length > DELETE_TODO_CONFIRM_PREVIEW_MAX_CHARS
          ? `${todo.text.slice(0, DELETE_TODO_CONFIRM_PREVIEW_MAX_CHARS)}…`
          : todo.text;
      const confirmed = await confirm({
        title: "Delete to-do?",
        message: `"${preview}"`,
        validateLabel: "Delete",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
      void handleDelete(todo);
    },
    [confirm, handleDelete]
  );

  const handleAddTodo = useCallback(
    async (text: string, assigneeSId: string): Promise<boolean> => {
      const result = await doCreateTodo({
        text,
        assigneeUserId: assigneeSId,
      });
      if (!result.isOk()) {
        return false;
      }
      const created: ProjectTodoType = {
        ...result.value,
        conversationId: null,
        conversationSidebarStatus: null,
      };
      await mutateTodos(
        (prev: GetProjectTodosResponseBody | undefined) => ({
          lastReadAt: prev?.lastReadAt ?? null,
          viewerUserId: prev?.viewerUserId ?? null,
          todos: [created, ...(prev?.todos ?? [])],
        }),
        { revalidate: true }
      );
      return true;
    },
    [doCreateTodo, mutateTodos]
  );

  const handleStartWorking = useCallback(
    async (
      todo: ProjectTodoType,
      options?: {
        customMessage?: string;
        agentConfigurationId?: string;
        goToConversation?: boolean;
      }
    ) => {
      setStartingTodoIds((prev) => new Set([...prev, todo.sId]));
      const result = await doStartConversation(todo.sId, {
        customMessage: options?.customMessage,
        agentConfigurationId: options?.agentConfigurationId,
      });
      if (result.isOk()) {
        const { conversationId } = result.value;
        if (options?.goToConversation && conversationId) {
          void router.push(
            getConversationRoute(owner.sId, conversationId),
            undefined,
            { shallow: true }
          );
        }
        // Reflect the new todo state (conversationId set) immediately.
        // Only patch conversationId — the server-side toJSON doesn't rehydrate
        // sources, so replacing the whole todo would transiently drop them.
        void mutateTodos(
          (prev: GetProjectTodosResponseBody | undefined) => ({
            lastReadAt: prev?.lastReadAt ?? null,
            viewerUserId: prev?.viewerUserId ?? viewerUserId,
            todos: (prev?.todos ?? []).map((t) =>
              t.sId === todo.sId
                ? {
                    ...t,
                    status: "in_progress",
                    doneAt: null,
                    markedAsDoneByType: null,
                    markedAsDoneByAgentConfigurationId: null,
                    conversationId,
                    conversationSidebarStatus: "idle",
                  }
                : t
            ),
          }),
          { revalidate: false }
        );
        void mutateSpaceConversations();
        void mutateSpaceSummary();
        void mutateTodos();
      }
      setStartingTodoIds((prev) => {
        const next = new Set(prev);
        next.delete(todo.sId);
        return next;
      });
    },
    [
      doStartConversation,
      mutateTodos,
      mutateSpaceConversations,
      mutateSpaceSummary,
      owner.sId,
      router,
      viewerUserId,
    ]
  );

  const showSuggestedTodosTable =
    !isTodosLoading &&
    frozenLastReadAt !== undefined &&
    groupedSuggestedTodosOnly.length > 0;

  return {
    assigneeSearch,
    setAssigneeSearch,
    isAssigneeMenuOpen,
    setIsAssigneeMenuOpen,
    filteredUsers,
    todoOwnerFilter,
    onTodoOwnerFilterChange,
    selectedUserSIds,
    viewerUserId,
    todoScopeLabel,
    isReadOnly,
    hasDoneItems,
    handleClean,
    isCleaning,
    showSuggestedTodosTable,
    owner,
    groupedSuggestedTodosOnly,
    groupedRegularTodosOnly,
    activeAgents,
    isAgentsLoading,
    agentNameById,
    pendingRemovalIds,
    newItemKeys,
    doneFlashKeys,
    startingTodoIds,
    firstOnboardingTodoId,
    projectMembers,
    membersWithActiveTodoIds,
    handleToggleDone,
    requestDelete,
    onApproveAgentSuggestion,
    onRejectAgentSuggestion,
    onApproveAllSuggestedForAssignee,
    onRejectAllSuggestedForAssignee,
    handleStartWorking,
    patchTodoItem,
    isSpaceInfoLoading,
    defaultNewAssigneeSId,
    handleAddTodo,
    isTodosLoading,
    frozenLastReadAt,
    todos,
    filteredTodos,
  };
}
