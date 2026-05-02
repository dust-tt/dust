import { EditableTodoItem } from "@app/components/assistant/conversation/space/conversations/project_todos/EditableTodoItem";
import {
  AddTodoComposer,
  formatTodoScopeLabel,
  TodoAssigneeHeader,
  type TodoOwnerFilter,
  useAgentNameById,
} from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import {
  ADD_TODO_BAR_SHELL_CLASS,
  DELETE_TODO_CONFIRM_PREVIEW_MAX_CHARS,
  SUMMARY_ITEM_TRANSITION_MS,
} from "@app/components/assistant/conversation/space/conversations/project_todos/utils";
import { ConfirmContext } from "@app/components/Confirm";
import {
  useSpaceConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useTodoDiffAnimations } from "@app/hooks/useTodoDiffAnimations";
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
import type { GetProjectTodosResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_todos/index";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type {
  ProjectTodoAssigneeType,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ChevronDownIcon,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  PlusIcon,
  Spinner,
  UserGroupIcon,
  UserIcon,
  WindIcon,
} from "@dust-tt/sparkle";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

export function EditableProjectTodosPanel({
  owner,
  spaceId,
  isReadOnly,
  todoOwnerFilter,
  onTodoOwnerFilterChange,
}: {
  owner: LightWorkspaceType;
  spaceId: string;
  isReadOnly?: boolean;
  todoOwnerFilter: TodoOwnerFilter;
  onTodoOwnerFilterChange: (value: TodoOwnerFilter) => void;
}) {
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

  const [isAddTodoComposerOpen, setIsAddTodoComposerOpen] = useState(false);

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

    return [...groups.values()].sort((a, b) => {
      const aIsViewer = viewerUserId !== null && a.user?.sId === viewerUserId;
      const bIsViewer = viewerUserId !== null && b.user?.sId === viewerUserId;
      if (aIsViewer !== bIsViewer) {
        return aIsViewer ? -1 : 1;
      }
      const aName = a.user?.fullName ?? "";
      const bName = b.user?.fullName ?? "";
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });
  }, [filteredTodos, viewerUserId]);

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
      options?: { customMessage?: string; agentConfigurationId?: string }
    ) => {
      setStartingTodoIds((prev) => new Set([...prev, todo.sId]));
      const result = await doStartConversation(todo.sId, {
        customMessage: options?.customMessage,
        agentConfigurationId: options?.agentConfigurationId,
      });
      if (result.isOk()) {
        const { conversationId } = result.value;
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
      viewerUserId,
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="inline-flex items-center gap-2">
        <DropdownMenu
          modal={false}
          open={isAssigneeMenuOpen}
          onOpenChange={(open) => {
            setIsAssigneeMenuOpen(open);
            if (open) {
              setAssigneeSearch("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted/40 dark:hover:bg-muted-night/40"
            >
              <h3 className="heading-2xl text-foreground dark:text-foreground-night">
                {todoScopeLabel}
              </h3>
              <Icon
                visual={ChevronDownIcon}
                size="sm"
                className="text-muted-foreground dark:text-muted-foreground-night"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
            align="start"
          >
            <DropdownMenuSearchbar
              autoFocus
              name="assignee-filter"
              placeholder="Search members"
              value={assigneeSearch}
              onChange={setAssigneeSearch}
            />
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              icon={UserIcon}
              label="Your to-dos"
              checked={todoOwnerFilter.assigneeScope === "mine"}
              onClick={() => {
                onTodoOwnerFilterChange({
                  assigneeScope: "mine",
                  selectedUserSIds: [],
                });
                setIsAssigneeMenuOpen(false);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
            <DropdownMenuCheckboxItem
              icon={UserGroupIcon}
              label="Project's to-dos"
              checked={todoOwnerFilter.assigneeScope === "all"}
              onClick={() => {
                onTodoOwnerFilterChange({
                  assigneeScope: "all",
                  selectedUserSIds: [],
                });
                setIsAssigneeMenuOpen(false);
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <DropdownMenuCheckboxItem
                    key={`todo-assignee-filter-${user.sId}`}
                    icon={() => (
                      <Avatar
                        size="xxs"
                        isRounded
                        visual={
                          user.image ?? "/static/humanavatar/anonymous.png"
                        }
                      />
                    )}
                    label={`${user.fullName}${viewerUserId === user.sId ? " (you)" : ""}`}
                    checked={
                      todoOwnerFilter.assigneeScope === "users" &&
                      selectedUserSIds.has(user.sId)
                    }
                    onClick={() => {
                      const next = new Set(selectedUserSIds);
                      if (next.has(user.sId)) {
                        next.delete(user.sId);
                      } else {
                        next.add(user.sId);
                      }
                      onTodoOwnerFilterChange({
                        assigneeScope: next.size === 0 ? "all" : "users",
                        selectedUserSIds: [...next],
                      });
                    }}
                    onSelect={(event) => {
                      event.preventDefault();
                    }}
                  />
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No members found
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        {!isReadOnly && hasDoneItems && (
          <Button
            size="xs"
            variant="outline"
            icon={WindIcon}
            label="Clean"
            tooltip="Hide all done to-dos"
            onClick={handleClean}
            disabled={isCleaning}
          />
        )}
      </div>

      {/* Manual add: discreet until opened; one row when expanded */}
      {!isReadOnly &&
        (isSpaceInfoLoading ? (
          <div className="flex h-7 items-center">
            <Spinner size="sm" />
          </div>
        ) : projectMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            No project members available to assign.
          </p>
        ) : isAddTodoComposerOpen ? (
          <AddTodoComposer
            projectMembers={projectMembers}
            viewerUserId={viewerUserId}
            defaultAssigneeSId={defaultNewAssigneeSId!}
            onAdd={handleAddTodo}
            onClose={() => setIsAddTodoComposerOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsAddTodoComposerOpen(true)}
            className={cn(
              ADD_TODO_BAR_SHELL_CLASS,
              "cursor-pointer text-left text-muted-foreground transition-colors",
              "hover:bg-muted-background/80 dark:text-muted-foreground-night dark:hover:bg-muted-background-night/70"
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center">
              <Icon visual={PlusIcon} size="xs" className="opacity-80" />
            </span>
            <span className="min-w-0 flex-1 text-base leading-6">
              Add a to-do
            </span>
            <span className="size-7 shrink-0" aria-hidden />
          </button>
        ))}

      {/* Body */}
      {isTodosLoading || frozenLastReadAt === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Todo items */}
          <div className="flex flex-col">
            {groupedTodosForAll.map((group) => (
              <div
                key={group.user?.sId ?? `unknown-${group.todos[0]?.id}`}
                className="mb-4 last:mb-0"
              >
                <TodoAssigneeHeader
                  user={group.user}
                  viewerUserId={viewerUserId}
                />
                <div className="ml-4 flex flex-col">
                  {group.todos.map((todo) => (
                    <EditableTodoItem
                      key={todo.sId}
                      todo={todo}
                      viewerUserId={viewerUserId}
                      onToggleDone={handleToggleDone}
                      onDelete={requestDelete}
                      onStartWorking={handleStartWorking}
                      owner={owner}
                      activeAgents={activeAgents}
                      agentsLoading={isAgentsLoading}
                      agentNameById={agentNameById}
                      isExiting={pendingRemovalIds.has(todo.sId)}
                      isNew={newItemKeys.has(todo.sId)}
                      isNewlyDone={doneFlashKeys.has(todo.sId)}
                      isStarting={startingTodoIds.has(todo.sId)}
                      isReadOnly={isReadOnly}
                      projectMembers={projectMembers}
                      membersWithActiveTodoIds={membersWithActiveTodoIds}
                      onPatchTodo={patchTodoItem}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {filteredTodos.length === 0 && (
            <p className="text-base italic text-faint dark:text-faint-night">
              You're all caught up!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
