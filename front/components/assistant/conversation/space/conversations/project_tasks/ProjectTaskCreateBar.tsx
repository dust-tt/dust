import { AddTaskComposer } from "@app/components/assistant/conversation/space/conversations/project_tasks/AddTaskComposer";
import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { Spinner } from "@dust-tt/sparkle";

export function ProjectTaskCreateBar() {
  const {
    viewerUserId,
    projectMembers,
    isReadOnly,
    isSpaceInfoLoading,
    defaultNewAssigneeId,
    handleAddTask,
  } = useProjectTasksPanel();

  if (isReadOnly) {
    return null;
  }

  if (isSpaceInfoLoading) {
    return (
      <div className="flex h-7 items-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (projectMembers.length === 0 || !defaultNewAssigneeId) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No project members available to assign.
      </p>
    );
  }

  return (
    <AddTaskComposer
      projectMembers={projectMembers}
      viewerUserId={viewerUserId}
      defaultAssigneeId={defaultNewAssigneeId}
      onAdd={handleAddTask}
    />
  );
}
