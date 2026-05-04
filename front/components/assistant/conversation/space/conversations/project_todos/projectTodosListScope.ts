import { z } from "zod";

export type ProjectTodoPeriodScope =
  | "active"
  | "last_24h"
  | "last_7d"
  | "last_30d";

export type ProjectTodoPeopleScope = "all_project" | "just_mine";

/** Filter for project todo list fetching + persisted project UI prefs. */
export interface TodoOwnerFilter {
  periodScope: ProjectTodoPeriodScope;
  peopleScope: ProjectTodoPeopleScope;
}

export const DEFAULT_TODO_OWNER_FILTER: TodoOwnerFilter = {
  periodScope: "active",
  peopleScope: "all_project",
};

const PERIOD_SCOPE_LABELS: Record<ProjectTodoPeriodScope, string> = {
  active: "Active",
  last_24h: "Last 24h",
  last_7d: "Last 7 days",
  last_30d: "Last 30 days",
};

const PEOPLE_SCOPE_LABELS: Record<ProjectTodoPeopleScope, string> = {
  all_project: "All project's",
  just_mine: "Just mine",
};

export function formatTodoScopeLabel(filter: TodoOwnerFilter): string {
  return `${PERIOD_SCOPE_LABELS[filter.periodScope]} · ${PEOPLE_SCOPE_LABELS[filter.peopleScope]}`;
}

const PERIOD_SCOPES: ProjectTodoPeriodScope[] = [
  "active",
  "last_24h",
  "last_7d",
  "last_30d",
];

function coercePeriodScope(raw: unknown): ProjectTodoPeriodScope {
  if (
    typeof raw === "string" &&
    PERIOD_SCOPES.includes(raw as ProjectTodoPeriodScope)
  ) {
    return raw as ProjectTodoPeriodScope;
  }
  return "active";
}

const todosOwnerFilterPersistedBlobSchema = z
  .object({
    periodScope: z.string().optional(),
    peopleScope: z.enum(["all_project", "just_mine"]).optional(),
    assigneeScope: z.enum(["mine", "all", "users"]).optional(),
    selectedUserSIds: z.array(z.string()).optional(),
  })
  .passthrough();

export function normalizeTodosOwnerFilterFromPersistedBlob(
  raw: unknown
): TodoOwnerFilter {
  const parsed = todosOwnerFilterPersistedBlobSchema.safeParse(raw);
  if (!parsed.success) {
    return DEFAULT_TODO_OWNER_FILTER;
  }
  const blob = parsed.data;

  const peopleScope: ProjectTodoPeopleScope =
    blob.peopleScope ??
    (blob.assigneeScope === "mine" ? "just_mine" : "all_project");

  return {
    periodScope: coercePeriodScope(blob.periodScope),
    peopleScope: peopleScope === "just_mine" ? "just_mine" : "all_project",
  };
}

/** Query string for GET /spaces/:id/project_todos (canonical `period` + `people`). */
export function todoOwnerFilterToSearchParams(
  filter: TodoOwnerFilter
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("period", filter.periodScope);
  params.set("people", filter.peopleScope === "just_mine" ? "mine" : "all");
  return params;
}

export function buildProjectTodosListSwrKey(
  workspaceSId: string,
  spaceId: string,
  filter: TodoOwnerFilter
): string {
  const base = `/api/w/${workspaceSId}/spaces/${spaceId}/project_todos`;
  const qs = todoOwnerFilterToSearchParams(filter).toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

export function isProjectTodosListSwrKey(
  key: unknown,
  workspaceSId: string,
  spaceId: string
): boolean {
  const prefix = `/api/w/${workspaceSId}/spaces/${spaceId}/project_todos`;
  return (
    typeof key === "string" && (key === prefix || key.startsWith(`${prefix}?`))
  );
}
