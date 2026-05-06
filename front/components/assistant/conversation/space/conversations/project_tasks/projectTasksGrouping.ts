import type {
  ProjectTaskAssigneeType,
  ProjectTaskType,
} from "@app/types/project_task";

/** Split full assignee groups into pending-suggestion tasks only (for the top table). */
export function groupedTasksPendingSuggestionsOnly(
  groups: Array<{
    user: ProjectTaskAssigneeType | null;
    tasks: ProjectTaskType[];
  }>
): Array<{ user: ProjectTaskAssigneeType | null; tasks: ProjectTaskType[] }> {
  return groups
    .map((g) => ({
      user: g.user,
      tasks: g.tasks.filter((t) => t.agentSuggestionStatus === "pending"),
    }))
    .filter((g) => g.tasks.length > 0);
}

/** Split full assignee groups into non-pending tasks (for the bottom table). */
export function groupedTasksNonPendingSuggestions(
  groups: Array<{
    user: ProjectTaskAssigneeType | null;
    tasks: ProjectTaskType[];
  }>
): Array<{ user: ProjectTaskAssigneeType | null; tasks: ProjectTaskType[] }> {
  return groups
    .map((g) => ({
      user: g.user,
      tasks: g.tasks.filter((t) => t.agentSuggestionStatus !== "pending"),
    }))
    .filter((g) => g.tasks.length > 0);
}
