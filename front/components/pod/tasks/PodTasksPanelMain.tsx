import { normalizePodTaskSearchNeedle } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import { PodTaskUserSection } from "@app/components/pod/tasks/PodTaskUserSection";
import { POD_TASK_UNASSIGNED_GROUP_KEY } from "@app/types/project_task";
import { Spinner } from "@dust-tt/sparkle";

export function PodTasksPanelMain() {
  const {
    isTasksLoading,
    isTasksError,
    frozenLastReadAt,
    combinedGroupedTasksByUser,
    filteredTasks,
    assigneeScopedTasks,
    debouncedTaskSearchQuery,
    hideAssigneeHeaders,
  } = usePodTasksPanel();

  const hasActiveLocalSearch =
    normalizePodTaskSearchNeedle(debouncedTaskSearchQuery) !== "";

  return (
    <div className="flex flex-col gap-3">
      {isTasksLoading || frozenLastReadAt === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          {combinedGroupedTasksByUser.map((group) => (
            <PodTaskUserSection
              key={group.user?.sId ?? POD_TASK_UNASSIGNED_GROUP_KEY}
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
