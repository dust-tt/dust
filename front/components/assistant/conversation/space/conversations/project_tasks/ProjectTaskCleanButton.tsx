import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { Button, WindIcon } from "@dust-tt/sparkle";

export function ProjectTaskCleanButton() {
  const isMobile = useIsMobile();
  const { taskOwnerFilter, isReadOnly, hasDoneItems, handleClean, isCleaning } =
    useProjectTasksPanel();

  const disabled =
    isReadOnly ||
    taskOwnerFilter.periodScope !== "active" ||
    !hasDoneItems ||
    isCleaning;

  return (
    <Button
      size="sm"
      variant="outline"
      icon={WindIcon}
      label={isMobile ? undefined : "Clean"}
      tooltip={isMobile ? "Clean — Hide all done tasks" : "Hide all done tasks"}
      onClick={handleClean}
      disabled={disabled}
    />
  );
}
