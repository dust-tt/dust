import { EditableTaskItem } from "@app/components/assistant/conversation/space/conversations/project_tasks/EditableTaskItem";
import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { SuggestedTaskItem } from "@app/components/assistant/conversation/space/conversations/project_tasks/SuggestedTaskItem";
import { TaskAssigneeHeader } from "@app/components/assistant/conversation/space/conversations/project_tasks/TaskSubComponents";
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
  ProjectTasksDataTableVariant,
  ProjectTaskTableRow,
} from "./ProjectTasksDataTable";

export type BulkAssigneeActionState = {
  groupKey: string;
  kind: "approve" | "reject";
} | null;

type ProjectTasksDataTableUiContextValue = {
  variant: ProjectTasksDataTableVariant;
  bulkAssigneeAction: BulkAssigneeActionState;
  runBulkApproveForGroup: (groupKey: string, taskIds: string[]) => void;
  runBulkRejectForGroup: (groupKey: string, taskIds: string[]) => void;
};

export const ProjectTasksDataTableUiContext =
  createContext<ProjectTasksDataTableUiContextValue | null>(null);

function useProjectTasksDataTableUi(): ProjectTasksDataTableUiContextValue {
  const ctx = useContext(ProjectTasksDataTableUiContext);
  if (!ctx) {
    throw new Error(
      "Project tasks table UI components require ProjectTasksDataTableUiContext.Provider"
    );
  }
  return ctx;
}

export function ProjectTasksDataTableHeaderTitle() {
  const { variant } = useProjectTasksDataTableUi();
  return <>{variant === "suggested" ? "Suggested" : "Task"}</>;
}

export function ProjectTasksDataTableCell({
  original,
}: {
  original: ProjectTaskTableRow;
}) {
  const {
    viewerUserId,
    owner,
    activeAgents,
    isAgentsLoading,
    agentNameById,
    newItemKeys,
    doneFlashKeys,
    startingTaskIds,
    isReadOnly,
    firstOnboardingTaskId,
    projectMembers,
    membersWithActiveTaskIds,
    handleToggleDone,
    requestDelete,
    onApproveAgentSuggestion,
    onRejectAgentSuggestion,
    handleStartWorking,
    patchTaskItem,
    isSoleProjectMember,
  } = useProjectTasksPanel();

  const {
    variant,
    bulkAssigneeAction,
    runBulkApproveForGroup,
    runBulkRejectForGroup,
  } = useProjectTasksDataTableUi();

  const allowAssigneeReassign = !isSoleProjectMember;

  if (original.kind === "assignee_header") {
    const bulkIds = original.pendingSuggestionTaskIds ?? [];
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
          <TaskAssigneeHeader
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
              tooltip="Accept all suggested tasks for this assignee"
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
              tooltip="Reject all suggested tasks for this assignee"
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

  if (original.kind !== "task") {
    return null;
  }

  const task = original.task;

  return (
    <>
      {variant === "suggested" ? (
        <SuggestedTaskItem
          key={task.sId}
          task={task}
          viewerUserId={viewerUserId}
          onApproveAgentSuggestion={onApproveAgentSuggestion}
          onRejectAgentSuggestion={onRejectAgentSuggestion}
          owner={owner}
          agentNameById={agentNameById}
          isNew={newItemKeys.has(task.sId)}
          isReadOnly={isReadOnly}
        />
      ) : (
        <EditableTaskItem
          key={task.sId}
          task={task}
          viewerUserId={viewerUserId}
          onToggleDone={handleToggleDone}
          onDelete={requestDelete}
          onStartWorking={handleStartWorking}
          owner={owner}
          activeAgents={activeAgents}
          agentsLoading={isAgentsLoading}
          agentNameById={agentNameById}
          isNew={newItemKeys.has(task.sId)}
          isNewlyDone={doneFlashKeys.has(task.sId)}
          isStarting={startingTaskIds.has(task.sId)}
          isReadOnly={isReadOnly}
          isFirstOnboardingTask={task.sId === firstOnboardingTaskId}
          projectMembers={projectMembers}
          membersWithActiveTaskIds={membersWithActiveTaskIds}
          onPatchTask={patchTaskItem}
          allowAssigneeReassign={allowAssigneeReassign}
        />
      )}
    </>
  );
}

export function ProjectTasksDataTableUiProvider({
  variant,
  children,
}: {
  variant: ProjectTasksDataTableVariant;
  children: ReactNode;
}) {
  const { onApproveAllSuggestedForAssignee, onRejectAllSuggestedForAssignee } =
    useProjectTasksPanel();

  const [bulkAssigneeAction, setBulkAssigneeAction] =
    useState<BulkAssigneeActionState>(null);

  const runBulkApproveForGroup = useCallback(
    (groupKey: string, taskIds: string[]) => {
      if (!onApproveAllSuggestedForAssignee || taskIds.length === 0) {
        return;
      }
      setBulkAssigneeAction({ groupKey, kind: "approve" });
      void (async () => {
        try {
          await onApproveAllSuggestedForAssignee(taskIds);
        } finally {
          setBulkAssigneeAction(null);
        }
      })();
    },
    [onApproveAllSuggestedForAssignee]
  );

  const runBulkRejectForGroup = useCallback(
    (groupKey: string, taskIds: string[]) => {
      if (!onRejectAllSuggestedForAssignee || taskIds.length === 0) {
        return;
      }
      setBulkAssigneeAction({ groupKey, kind: "reject" });
      void (async () => {
        try {
          await onRejectAllSuggestedForAssignee(taskIds);
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
    <ProjectTasksDataTableUiContext.Provider value={value}>
      {children}
    </ProjectTasksDataTableUiContext.Provider>
  );
}
