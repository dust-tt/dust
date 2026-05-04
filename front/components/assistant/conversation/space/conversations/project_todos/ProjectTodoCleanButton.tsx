import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { Button, WindIcon } from "@dust-tt/sparkle";

export function ProjectTodoCleanButton() {
  const isMobile = useIsMobile();
  const { todoOwnerFilter, isReadOnly, hasDoneItems, handleClean, isCleaning } =
    useProjectTodosPanel();

  const disabled =
    isReadOnly ||
    todoOwnerFilter.periodScope !== "active" ||
    !hasDoneItems ||
    isCleaning;

  return (
    <Button
      size="sm"
      variant="outline"
      icon={WindIcon}
      label={isMobile ? undefined : "Clean"}
      tooltip={
        isMobile ? "Clean — Hide all done to-dos" : "Hide all done to-dos"
      }
      onClick={handleClean}
      disabled={disabled}
    />
  );
}
