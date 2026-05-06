import { AddTaskComposer } from "@app/components/assistant/conversation/space/conversations/project_tasks/AddTaskComposer";
import { ProjectTasksDataTable } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksDataTable";
import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { normalizeProjectTaskSearchNeedle } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { Spinner } from "@dust-tt/sparkle";

export function ProjectTasksPanelMain() {
  const {
    showSuggestedTasksTable,
    groupedSuggestedTasksOnly,
    viewerUserId,
    projectMembers,
    isReadOnly,
    isSpaceInfoLoading,
    defaultNewAssigneeSId,
    handleAddTask,
    isTasksLoading,
    isTasksError,
    frozenLastReadAt,
    groupedRegularTasksOnly,
    filteredTasks,
    assigneeScopedTasks,
    debouncedTaskSearchQuery,
    hideRegularTaskAssigneeHeaders,
  } = useProjectTasksPanel();

  const hasActiveLocalSearch =
    normalizeProjectTaskSearchNeedle(debouncedTaskSearchQuery) !== "";

  return (
    <>
      {showSuggestedTasksTable && (
        <div className="mb-4">
          <ProjectTasksDataTable
            variant="suggested"
            groupedTasksForAll={groupedSuggestedTasksOnly}
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {/* Manual add: single row; expands on focus / menu / typed text */}
        {!isReadOnly &&
          (isSpaceInfoLoading ? (
            <div className="flex h-7 items-center">
              <Spinner size="sm" />
            </div>
          ) : projectMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              No project members available to assign.
            </p>
          ) : (
            <AddTaskComposer
              projectMembers={projectMembers}
              viewerUserId={viewerUserId}
              defaultAssigneeSId={defaultNewAssigneeSId!}
              onAdd={handleAddTask}
            />
          ))}

        {/* Body */}
        {isTasksLoading || frozenLastReadAt === undefined ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            {groupedRegularTasksOnly.length > 0 && (
              <ProjectTasksDataTable
                variant="regular"
                groupedTasksForAll={groupedRegularTasksOnly}
                hideAssigneeGroupHeaders={hideRegularTaskAssigneeHeaders}
              />
            )}

            {/* Empty state */}
            {filteredTasks.length === 0 && (
              <p className="text-base italic text-faint dark:text-faint-night">
                {hasActiveLocalSearch && assigneeScopedTasks.length > 0
                  ? "No tasks match your filter."
                  : isTasksError
                    ? "Error loading tasks."
                    : "You're all caught up!"}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
