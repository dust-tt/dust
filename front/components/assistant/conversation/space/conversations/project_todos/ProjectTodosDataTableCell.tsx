import { EditableTodoItem } from "@app/components/assistant/conversation/space/conversations/project_todos/EditableTodoItem";
import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { SuggestedTodoItem } from "@app/components/assistant/conversation/space/conversations/project_todos/SuggestedTodoItem";
import { TodoAssigneeHeader } from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import { Button, CheckIcon, cn, XMarkIcon } from "@dust-tt/sparkle";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type {
  ProjectTodosDataTableVariant,
  ProjectTodoTableRow,
} from "./ProjectTodosDataTable";

export type BulkAssigneeActionState = {
  groupKey: string;
  kind: "approve" | "reject";
} | null;

type ProjectTodosDataTableUiContextValue = {
  variant: ProjectTodosDataTableVariant;
  bulkAssigneeAction: BulkAssigneeActionState;
  runBulkApproveForGroup: (groupKey: string, todoIds: string[]) => void;
  runBulkRejectForGroup: (groupKey: string, todoIds: string[]) => void;
};

export const ProjectTodosDataTableUiContext =
  createContext<ProjectTodosDataTableUiContextValue | null>(null);

function useProjectTodosDataTableUi(): ProjectTodosDataTableUiContextValue {
  const ctx = useContext(ProjectTodosDataTableUiContext);
  if (!ctx) {
    throw new Error(
      "Project todos table UI components require ProjectTodosDataTableUiContext.Provider"
    );
  }
  return ctx;
}

export function ProjectTodosDataTableHeaderTitle() {
  const { variant } = useProjectTodosDataTableUi();
  return <>{variant === "suggested" ? "Suggested" : "To-do"}</>;
}

export function ProjectTodosDataTableCell({
  original,
}: {
  original: ProjectTodoTableRow;
}) {
  const {
    viewerUserId,
    owner,
    activeAgents,
    isAgentsLoading,
    agentNameById,
    pendingRemovalIds,
    newItemKeys,
    doneFlashKeys,
    startingTodoIds,
    isReadOnly,
    firstOnboardingTodoId,
    projectMembers,
    membersWithActiveTodoIds,
    handleToggleDone,
    requestDelete,
    onApproveAgentSuggestion,
    onRejectAgentSuggestion,
    handleStartWorking,
    patchTodoItem,
    isSoleProjectMember,
  } = useProjectTodosPanel();

  const {
    variant,
    bulkAssigneeAction,
    runBulkApproveForGroup,
    runBulkRejectForGroup,
  } = useProjectTodosDataTableUi();

  const allowAssigneeReassign = !isSoleProjectMember;

  if (original.kind === "assignee_header") {
    const bulkIds = original.pendingSuggestionTodoIds ?? [];
    const showBulkActions =
      variant === "suggested" &&
      bulkIds.length > 0 &&
      viewerUserId !== null &&
      !isReadOnly;

    const rowBusy = bulkAssigneeAction?.groupKey === original.groupKey;
    const approveBulkLoading =
      rowBusy && bulkAssigneeAction?.kind === "approve";
    const rejectBulkLoading = rowBusy && bulkAssigneeAction?.kind === "reject";

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
          key={todo.sId}
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
          isFirstOnboardingTodo={todo.sId === firstOnboardingTodoId}
          projectMembers={projectMembers}
          membersWithActiveTodoIds={membersWithActiveTodoIds}
          onPatchTodo={patchTodoItem}
          allowAssigneeReassign={allowAssigneeReassign}
        />
      )}
    </div>
  );
}

export function ProjectTodosDataTableUiProvider({
  variant,
  children,
}: {
  variant: ProjectTodosDataTableVariant;
  children: ReactNode;
}) {
  const { onApproveAllSuggestedForAssignee, onRejectAllSuggestedForAssignee } =
    useProjectTodosPanel();

  const [bulkAssigneeAction, setBulkAssigneeAction] =
    useState<BulkAssigneeActionState>(null);

  const runBulkApproveForGroup = useCallback(
    (groupKey: string, todoIds: string[]) => {
      if (!onApproveAllSuggestedForAssignee || todoIds.length === 0) {
        return;
      }
      setBulkAssigneeAction({ groupKey, kind: "approve" });
      void (async () => {
        try {
          await onApproveAllSuggestedForAssignee(todoIds);
        } finally {
          setBulkAssigneeAction(null);
        }
      })();
    },
    [onApproveAllSuggestedForAssignee]
  );

  const runBulkRejectForGroup = useCallback(
    (groupKey: string, todoIds: string[]) => {
      if (!onRejectAllSuggestedForAssignee || todoIds.length === 0) {
        return;
      }
      setBulkAssigneeAction({ groupKey, kind: "reject" });
      void (async () => {
        try {
          await onRejectAllSuggestedForAssignee(todoIds);
        } finally {
          setBulkAssigneeAction(null);
        }
      })();
    },
    [onRejectAllSuggestedForAssignee]
  );

  const value = useMemo(
    () => ({
      variant,
      bulkAssigneeAction,
      runBulkApproveForGroup,
      runBulkRejectForGroup,
    }),
    [variant, bulkAssigneeAction, runBulkApproveForGroup, runBulkRejectForGroup]
  );

  return (
    <ProjectTodosDataTableUiContext.Provider value={value}>
      {children}
    </ProjectTodosDataTableUiContext.Provider>
  );
}
