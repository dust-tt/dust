import type {
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";

/** Split full assignee groups into pending-suggestion todos only (for the top table). */
export function groupedTodosPendingSuggestionsOnly(
  groups: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>
): Array<{ user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }> {
  return groups
    .map((g) => ({
      user: g.user,
      todos: g.todos.filter((t) => t.agentSuggestionStatus === "pending"),
    }))
    .filter((g) => g.todos.length > 0);
}

/** Split full assignee groups into non-pending todos (for the bottom table). */
export function groupedTodosNonPendingSuggestions(
  groups: Array<{
    user: ProjectTodoAssigneeType | null;
    todos: ProjectTodoType[];
  }>
): Array<{ user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }> {
  return groups
    .map((g) => ({
      user: g.user,
      todos: g.todos.filter((t) => t.agentSuggestionStatus !== "pending"),
    }))
    .filter((g) => g.todos.length > 0);
}
