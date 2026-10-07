import type {
  PodTaskPeopleScope,
  PodTaskPeriodScope,
} from "@app/types/project_task";
import { isPodTaskPeriodScope } from "@app/types/project_task";
import { isString } from "@app/types/shared/utils/general";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

/** Filter for project task list fetching + persisted project UI prefs. */
export interface TaskOwnerFilter {
  periodScope: PodTaskPeriodScope;
  peopleScope: PodTaskPeopleScope;
}

export const DEFAULT_TASK_OWNER_FILTER: TaskOwnerFilter = {
  periodScope: "active",
  peopleScope: "all_project",
};

const PERIOD_SCOPE_LABELS: Record<PodTaskPeriodScope, MessageDescriptor> = {
  active: msg({ message: "Open", context: "task status filter" }),
  last_24h: msg`Done today`,
  last_7d: msg`Done in the last 7 days`,
  last_30d: msg`Done in the last 30 days`,
};

const PEOPLE_SCOPE_LABELS: Record<PodTaskPeopleScope, MessageDescriptor> = {
  all_project: msg`Everyone`,
  just_mine: msg({ message: "Mine", context: "task owner filter" }),
};

export function periodScopeLabel(scope: PodTaskPeriodScope): MessageDescriptor {
  return PERIOD_SCOPE_LABELS[scope];
}

export function peopleScopeLabel(scope: PodTaskPeopleScope): MessageDescriptor {
  return PEOPLE_SCOPE_LABELS[scope];
}

function coercePeriodScope(raw: unknown): PodTaskPeriodScope {
  if (isString(raw) && isPodTaskPeriodScope(raw)) {
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
function taskOwnerFilterToSearchParams(
  filter: TaskOwnerFilter
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("period", filter.periodScope);
  params.set("people", filter.peopleScope === "just_mine" ? "mine" : "all");
  return params;
}

export function buildPodTasksListSwrKey(
  workspaceId: string,
  podId: string,
  filter: TaskOwnerFilter
): string {
  const base = `/api/w/${workspaceId}/spaces/${podId}/project_tasks`;
  const qs = taskOwnerFilterToSearchParams(filter).toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

export function isPodTasksListSwrKey(
  key: unknown,
  workspaceId: string,
  podId: string
): boolean {
  const prefix = `/api/w/${workspaceId}/spaces/${podId}/project_tasks`;
  return (
    typeof key === "string" && (key === prefix || key.startsWith(`${prefix}?`))
  );
}
