import type { EditableTodoItemProps } from "@app/components/assistant/conversation/space/conversations/project_todos/EditableTodoItem";
import { EditableTodoItem } from "@app/components/assistant/conversation/space/conversations/project_todos/EditableTodoItem";
import { SuggestedTodoItem } from "@app/components/assistant/conversation/space/conversations/project_todos/SuggestedTodoItem";
import { TodoAssigneeHeader } from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import {
  Button,
  CheckIcon,
  cn,
  DataTable,
  type MenuItem,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

type BulkAssigneeActionState = {
  groupKey: string;
  kind: "approve" | "reject";
} | null;

/** Split full assignee groups into pending-suggestion todos only (for the top table). */
export function groupedTodosPendingSuggestionsOnly(
  groups: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>
): Array<{ user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }> {
  return groups
    .map((g) => ({
      user: g.user,
      todos: g.todos.filter((t) => t.agentSuggestionStatus === "pending"),
    }))
    .filter((g) => g.todos.length > 0);
}

/** Split full assignee groups into non-pending todos (for the bottom table). */
export function groupedTodosNonPendingSuggestions(
  groups: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>
): Array<{ user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }> {
  return groups
    .map((g) => ({
      user: g.user,
      todos: g.todos.filter((t) => t.agentSuggestionStatus !== "pending"),
    }))
    .filter((g) => g.todos.length > 0);
}

const SUGGESTED_TABLE_SHELL_CLASS =
  "mx-auto w-full max-w-[52rem] rounded-lg border border-border bg-muted-background/50 p-2 dark:border-border-night dark:bg-muted-background-night/35";

type SparkleTodoTableExtras = {
  onClick?: () => void;
  onDoubleClick?: () => void;
  menuItems?: MenuItem[];
};

export type ProjectTodosDataTableVariant = "suggested" | "regular";

export type ProjectTodoTableRow = SparkleTodoTableExtras &
  (
    | {
        kind: "assignee_header";
        groupKey: string;
        user: ProjectTodoAssigneeType | null;
        isFirstGroup: boolean;
        /** Suggested table only: sIds of pending suggestions in this assignee group */
        pendingSuggestionTodoIds?: string[];
      }
    | { kind: "todo"; todo: ProjectTodoType }
  );

function flattenGroupedTodos(
  groups: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>,
  variant: ProjectTodosDataTableVariant
): ProjectTodoTableRow[] {
  const rows: ProjectTodoTableRow[] = [];
  let groupIndex = 0;

  for (const group of groups) {
    const groupKey =
      group.user?.sId ?? `unknown-${group.todos[0]?.id ?? "empty"}`;
    rows.push({
      kind: "assignee_header",
      groupKey,
      user: group.user,
      isFirstGroup: groupIndex === 0,
      pendingSuggestionTodoIds:
        variant === "suggested" ? group.todos.map((t) => t.sId) : undefined,
    });
    groupIndex += 1;

    for (const todo of group.todos) {
      rows.push({ kind: "todo", todo });
    }
  }
  return rows;
}

export type ProjectTodosDataTableProps = {
  variant: ProjectTodosDataTableVariant;
  groupedTodosForAll: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>;
  viewerUserId: string | null;
  owner: LightWorkspaceType;
  activeAgents: LightAgentConfigurationType[];
  agentsLoading: boolean;
  agentNameById: Map<string, string>;
  pendingRemovalIds: Set<string>;
  newItemKeys: Set<string>;
  doneFlashKeys: Set<string>;
  startingTodoIds: Set<string>;
  isReadOnly?: boolean;
  firstOnboardingTodoId: string | null;
  projectMembers: SpaceUserType[];
  membersWithActiveTodoIds: Set<string>;
  onToggleDone: (todo: ProjectTodoType) => void;
  onDelete: (todo: ProjectTodoType) => void | Promise<void>;
  onApproveAgentSuggestion: (todo: ProjectTodoType) => void | Promise<void>;
  onRejectAgentSuggestion: (todo: ProjectTodoType) => void | Promise<void>;
  /** Suggested table: approve every pending suggestion listed under this assignee */
  onApproveAllSuggestedForAssignee?: (
    todoIds: string[]
  ) => void | Promise<void>;
  onRejectAllSuggestedForAssignee?: (todoIds: string[]) => void | Promise<void>;
  onStartWorking: EditableTodoItemProps["onStartWorking"];
  onPatchTodo: EditableTodoItemProps["onPatchTodo"];
  /** Regular table: omit per-assignee header rows (flat list). */
  hideAssigneeGroupHeaders?: boolean;
  /** When false, hides the overflow "Reassign" submenu (e.g. sole project member). */
  allowAssigneeReassign?: boolean;
};

export function ProjectTodosDataTable({
  variant,
  groupedTodosForAll,
  viewerUserId,
  owner,
  activeAgents,
  agentsLoading,
  agentNameById,
  pendingRemovalIds,
  newItemKeys,
  doneFlashKeys,
  startingTodoIds,
  isReadOnly,
  firstOnboardingTodoId,
  projectMembers,
  membersWithActiveTodoIds,
  onToggleDone,
  onDelete,
  onApproveAgentSuggestion,
  onRejectAgentSuggestion,
  onApproveAllSuggestedForAssignee,
  onRejectAllSuggestedForAssignee,
  onStartWorking,
  onPatchTodo,
  hideAssigneeGroupHeaders = false,
  allowAssigneeReassign = true,
}: ProjectTodosDataTableProps) {
  const [bulkAssigneeAction, setBulkAssigneeAction] =
    useState<BulkAssigneeActionState>(null);

  const runBulkApproveForGroup = useCallback(
    async (groupKey: string, todoIds: string[]) => {
      if (!onApproveAllSuggestedForAssignee || todoIds.length === 0) {
        return;
      }
      setBulkAssigneeAction({ groupKey, kind: "approve" });
      try {
        await onApproveAllSuggestedForAssignee(todoIds);
      } finally {
        setBulkAssigneeAction(null);
      }
    },
    [onApproveAllSuggestedForAssignee]
  );

  const runBulkRejectForGroup = useCallback(
    async (groupKey: string, todoIds: string[]) => {
      if (!onRejectAllSuggestedForAssignee || todoIds.length === 0) {
        return;
      }
      setBulkAssigneeAction({ groupKey, kind: "reject" });
      try {
        await onRejectAllSuggestedForAssignee(todoIds);
      } finally {
        setBulkAssigneeAction(null);
      }
    },
    [onRejectAllSuggestedForAssignee]
  );

  const data = useMemo(() => {
    if (
      variant === "regular" &&
      hideAssigneeGroupHeaders &&
      groupedTodosForAll.length > 0
    ) {
      return groupedTodosForAll.flatMap((group) =>
        group.todos.map((todo) => ({ kind: "todo" as const, todo }))
      );
    }
    return flattenGroupedTodos(groupedTodosForAll, variant);
  }, [groupedTodosForAll, variant, hideAssigneeGroupHeaders]);

  const columns = useMemo<ColumnDef<ProjectTodoTableRow>[]>(
    () => [
      {
        id: "content",
        header: variant === "suggested" ? "Suggested" : "To-do",
        accessorFn: (row) => row,
        enableSorting: false,
        meta: {
          className:
            "h-auto min-h-0 max-h-none align-top whitespace-normal overflow-visible py-0 px-1",
        },
        cell: ({ row }) => {
          const original = row.original;
          if (original.kind === "assignee_header") {
            const bulkIds = original.pendingSuggestionTodoIds ?? [];
            const showBulkActions =
              variant === "suggested" &&
              bulkIds.length > 0 &&
              viewerUserId !== null &&
              !isReadOnly &&
              onApproveAllSuggestedForAssignee &&
              onRejectAllSuggestedForAssignee;

            const rowBusy = bulkAssigneeAction?.groupKey === original.groupKey;
            const approveBulkLoading =
              rowBusy && bulkAssigneeAction?.kind === "approve";
            const rejectBulkLoading =
              rowBusy && bulkAssigneeAction?.kind === "reject";

            return (
              <div
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  !original.isFirstGroup && "mt-4"
                )}
              >
                <div className="min-w-0 flex-1">
                  <TodoAssigneeHeader
                    user={original.user}
                    viewerUserId={viewerUserId}
                    className="mb-0 mt-0"
                  />
                </div>
                {showBulkActions ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      icon={CheckIcon}
                      size="mini"
                      variant="outline"
                      tooltip="Accept all suggested to-dos for this assignee"
                      isLoading={approveBulkLoading}
                      disabled={rowBusy}
                      className="text-success-500 hover:text-success-600 dark:text-success-500-night dark:hover:text-success-600-night"
                      onClick={(e) => {
                        e.stopPropagation();
                        void runBulkApproveForGroup(original.groupKey, bulkIds);
                      }}
                    />
                    <Button
                      icon={XMarkIcon}
                      size="mini"
                      variant="outline"
                      tooltip="Reject all suggested to-dos for this assignee"
                      isLoading={rejectBulkLoading}
                      disabled={rowBusy}
                      className="text-warning-500 hover:text-warning-600 dark:text-warning-500-night dark:hover:text-warning-600-night"
                      onClick={(e) => {
                        e.stopPropagation();
                        void runBulkRejectForGroup(original.groupKey, bulkIds);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          }
          if (original.kind !== "todo") {
            return null;
          }
          const todo = original.todo;
          return (
            <div className="py-0.5 pl-4 pr-0">
              {variant === "suggested" ? (
                <SuggestedTodoItem
                  todo={todo}
                  viewerUserId={viewerUserId}
                  onApproveAgentSuggestion={onApproveAgentSuggestion}
                  onRejectAgentSuggestion={onRejectAgentSuggestion}
                  owner={owner}
                  agentNameById={agentNameById}
                  isExiting={pendingRemovalIds.has(todo.sId)}
                  isNew={newItemKeys.has(todo.sId)}
                  isReadOnly={isReadOnly}
                />
              ) : (
                <EditableTodoItem
                  todo={todo}
                  viewerUserId={viewerUserId}
                  onToggleDone={onToggleDone}
                  onDelete={onDelete}
                  onStartWorking={onStartWorking}
                  owner={owner}
                  activeAgents={activeAgents}
                  agentsLoading={agentsLoading}
                  agentNameById={agentNameById}
                  isExiting={pendingRemovalIds.has(todo.sId)}
                  isNew={newItemKeys.has(todo.sId)}
                  isNewlyDone={doneFlashKeys.has(todo.sId)}
                  isStarting={startingTodoIds.has(todo.sId)}
                  isReadOnly={isReadOnly}
                  isFirstOnboardingTodo={todo.sId === firstOnboardingTodoId}
                  projectMembers={projectMembers}
                  membersWithActiveTodoIds={membersWithActiveTodoIds}
                  onPatchTodo={onPatchTodo}
                  allowAssigneeReassign={allowAssigneeReassign}
                />
              )}
            </div>
          );
        },
      },
    ],
    [
      variant,
      viewerUserId,
      owner,
      activeAgents,
      agentsLoading,
      agentNameById,
      pendingRemovalIds,
      newItemKeys,
      doneFlashKeys,
      startingTodoIds,
      isReadOnly,
      firstOnboardingTodoId,
      projectMembers,
      membersWithActiveTodoIds,
      onToggleDone,
      onDelete,
      onApproveAgentSuggestion,
      onRejectAgentSuggestion,
      onStartWorking,
      onPatchTodo,
      bulkAssigneeAction,
      runBulkApproveForGroup,
      runBulkRejectForGroup,
      onApproveAllSuggestedForAssignee,
      onRejectAllSuggestedForAssignee,
      allowAssigneeReassign,
    ]
  );

  if (groupedTodosForAll.length === 0) {
    return null;
  }

  const table = (
    <DataTable<ProjectTodoTableRow>
      data={data}
      columns={columns}
      widthClassName="w-full"
      hideRowDivider
      className="[&_thead]:hidden"
      getRowId={(row) =>
        row.kind === "assignee_header"
          ? `${variant}-assignee-${row.groupKey}`
          : row.todo.sId
      }
    />
  );

  if (variant === "suggested") {
    return <div className={SUGGESTED_TABLE_SHELL_CLASS}>{table}</div>;
  }

  return table;
}
