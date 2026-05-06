import { z } from "zod";

export type ProjectTaskPeriodScope =
  | "active"
  | "last_24h"
  | "last_7d"
  | "last_30d";

export type ProjectTaskPeopleScope = "all_project" | "just_mine" | "unassigned";

/** Filter for project task list fetching + persisted project UI prefs. */
export interface TaskOwnerFilter {
  periodScope: ProjectTaskPeriodScope;
  peopleScope: ProjectTaskPeopleScope;
}

export const DEFAULT_TASK_OWNER_FILTER: TaskOwnerFilter = {
  periodScope: "active",
  peopleScope: "all_project",
};

const PERIOD_SCOPE_LABELS: Record<ProjectTaskPeriodScope, string> = {
  active: "Open",
  last_24h: "Done today",
  last_7d: "Done in the last 7 days",
  last_30d: "Done in the last 30 days",
};

const PEOPLE_SCOPE_LABELS: Record<ProjectTaskPeopleScope, string> = {
  all_project: "Everyone",
  just_mine: "Mine",
  unassigned: "Unassigned",
};

export function formatTaskScopeLabel(filter: TaskOwnerFilter): string {
  return `${PERIOD_SCOPE_LABELS[filter.periodScope]} · ${PEOPLE_SCOPE_LABELS[filter.peopleScope]}`;
}

const PERIOD_SCOPES: ProjectTaskPeriodScope[] = [
  "active",
  "last_24h",
  "last_7d",
  "last_30d",
];

function coercePeriodScope(raw: unknown): ProjectTaskPeriodScope {
  if (
    typeof raw === "string" &&
    PERIOD_SCOPES.includes(raw as ProjectTaskPeriodScope)
  ) {
    return raw as ProjectTaskPeriodScope;
  }
  return "active";
}

const tasksOwnerFilterPersistedBlobSchema = z
  .object({
    periodScope: z.string().optional(),
    peopleScope: z.enum(["all_project", "just_mine", "unassigned"]).optional(),
    assigneeScope: z.enum(["mine", "all", "users"]).optional(),
    selectedUserSIds: z.array(z.string()).optional(),
  })
  .passthrough();

export function normalizeTasksOwnerFilterFromPersistedBlob(
  raw: unknown
): TaskOwnerFilter {
  const parsed = tasksOwnerFilterPersistedBlobSchema.safeParse(raw);
  if (!parsed.success) {
    return DEFAULT_TASK_OWNER_FILTER;
  }
  const blob = parsed.data;

  let peopleScope: ProjectTaskPeopleScope = "all_project";
  if (
    blob.peopleScope === "just_mine" ||
    blob.peopleScope === "unassigned" ||
    blob.peopleScope === "all_project"
  ) {
    peopleScope = blob.peopleScope;
  } else if (blob.assigneeScope === "mine") {
    peopleScope = "just_mine";
  }

  return {
    periodScope: coercePeriodScope(blob.periodScope),
    peopleScope,
  };
}

/** Query string for GET /spaces/:id/project_tasks (canonical `period` + `people`). */
export function taskOwnerFilterToSearchParams(
  filter: TaskOwnerFilter
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("period", filter.periodScope);
  params.set(
    "people",
    filter.peopleScope === "just_mine"
      ? "mine"
      : filter.peopleScope === "unassigned"
        ? "unassigned"
        : "all"
  );
  return params;
}

export function buildProjectTasksListSwrKey(
  workspaceSId: string,
  spaceId: string,
  filter: TaskOwnerFilter
): string {
  const base = `/api/w/${workspaceSId}/spaces/${spaceId}/project_tasks`;
  const qs = taskOwnerFilterToSearchParams(filter).toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

export function isProjectTasksListSwrKey(
  key: unknown,
  workspaceSId: string,
  spaceId: string
): boolean {
  const prefix = `/api/w/${workspaceSId}/spaces/${spaceId}/project_tasks`;
  return (
    typeof key === "string" && (key === prefix || key.startsWith(`${prefix}?`))
  );
}
