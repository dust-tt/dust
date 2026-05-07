import {
  isProjectTaskPeriodScope,
  type ProjectTaskPeopleScope,
  type ProjectTaskPeriodScope,
} from "@app/types/project_task";
import { isString } from "@app/types/shared/utils/general";
import { z } from "zod";

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
};

export function periodScopeLabel(scope: ProjectTaskPeriodScope): string {
  return PERIOD_SCOPE_LABELS[scope];
}

export function peopleScopeLabel(scope: ProjectTaskPeopleScope): string {
  return PEOPLE_SCOPE_LABELS[scope];
}

function coercePeriodScope(raw: unknown): ProjectTaskPeriodScope {
  if (isString(raw) && isProjectTaskPeriodScope(raw)) {
    return raw;
  }
  return "active";
}

const tasksOwnerFilterPersistedBlobSchema = z
  .object({
    periodScope: z.string().optional(),
    peopleScope: z.enum(["all_project", "just_mine"]).optional(),
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

  return {
    periodScope: coercePeriodScope(blob.periodScope),
    peopleScope: blob.peopleScope ?? "all_project",
  };
}

/** Query string for GET /spaces/:id/project_tasks (canonical `period` + `people`). */
export function taskOwnerFilterToSearchParams(
  filter: TaskOwnerFilter
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("period", filter.periodScope);
  params.set("people", filter.peopleScope === "just_mine" ? "mine" : "all");
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
