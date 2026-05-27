import { AddTaskComposer } from "@app/components/pod/tasks/AddTaskComposer";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import { Spinner } from "@dust-tt/sparkle";

export function PodTaskCreateBar() {
  const {
    viewerUserId,
    podMembers,
    isReadOnly,
    isPodInfoLoading,
    defaultNewAssigneeId,
    handleAddTask,
  } = usePodTasksPanel();

  if (isReadOnly) {
    return null;
  }

  if (isPodInfoLoading) {
    return (
      <div className="flex h-7 items-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (podMembers.length === 0 || !defaultNewAssigneeId) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No Pod members available to assign.
      </p>
    );
  }

  return (
    <AddTaskComposer
      podMembers={podMembers}
      viewerUserId={viewerUserId}
      defaultAssigneeId={defaultNewAssigneeId}
      onAdd={handleAddTask}
    />
  );
}
