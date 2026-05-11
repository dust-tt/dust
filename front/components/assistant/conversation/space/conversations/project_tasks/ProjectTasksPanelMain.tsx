import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { ProjectTaskUserSection } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTaskUserSection";
import { normalizeProjectTaskSearchNeedle } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { PROJECT_TASK_UNASSIGNED_GROUP_KEY } from "@app/types/project_task";
import { Spinner } from "@dust-tt/sparkle";

export function ProjectTasksPanelMain() {
  const {
    isTasksLoading,
    isTasksError,
    frozenLastReadAt,
    combinedGroupedTasksByUser,
    filteredTasks,
    assigneeScopedTasks,
    debouncedTaskSearchQuery,
    hideAssigneeHeaders,
  } = useProjectTasksPanel();

  const hasActiveLocalSearch =
    normalizeProjectTaskSearchNeedle(debouncedTaskSearchQuery) !== "";

  return (
    <div className="flex flex-col gap-3">
      {isTasksLoading || frozenLastReadAt === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          {combinedGroupedTasksByUser.map((group) => (
            <ProjectTaskUserSection
              key={group.user?.sId ?? PROJECT_TASK_UNASSIGNED_GROUP_KEY}
              user={group.user}
              suggestedTasks={group.suggestedTasks}
              regularTasks={group.regularTasks}
              showHeader={!hideAssigneeHeaders}
            />
          ))}

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
  );
}
