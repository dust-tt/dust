import {
  PROJECT_TASK_NO_ASSIGNEE_LABEL,
  PROJECT_TASK_UNASSIGNED_GROUP_KEY,
  type ProjectTaskAssigneeType,
  type ProjectTaskStatus,
  type ProjectTaskType,
} from "@app/types/project_task";

const PROJECT_TASK_STATUS_SORT_RANK: Record<ProjectTaskStatus, number> = {
  in_progress: 0,
  todo: 1,
  done: 2,
};

function projectTaskUpdatedAtMs(t: ProjectTaskType): number {
  const u = t.updatedAt;
  if (u instanceof Date) {
    return u.getTime();
  }
  return new Date(String(u)).getTime();
}

/** In progress → Open → Done, then `updatedAt` descending. Used on first load per assignee group. */
export function sortProjectTasksForInitialDisplay(
  tasks: ProjectTaskType[]
): ProjectTaskType[] {
  return [...tasks].sort((a, b) => {
    const rankDiff =
      PROJECT_TASK_STATUS_SORT_RANK[a.status] -
      PROJECT_TASK_STATUS_SORT_RANK[b.status];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return projectTaskUpdatedAtMs(b) - projectTaskUpdatedAtMs(a);
  });
}

/**
 * Preserves a previously shown order on revalidation; new items (not in `prevOrderedSIds`)
 * are prepended, ordered among themselves with {@link sortProjectTasksForInitialDisplay}.
 */
export function mergeProjectTaskStableOrder(
  prevOrderedSIds: string[] | undefined,
  tasks: ProjectTaskType[]
): string[] {
  const currentSet = new Set(tasks.map((t) => t.sId));

  if (!prevOrderedSIds || prevOrderedSIds.length === 0) {
    return sortProjectTasksForInitialDisplay(tasks).map((t) => t.sId);
  }

  const prevSet = new Set(prevOrderedSIds);
  const kept = prevOrderedSIds.filter((id) => currentSet.has(id));
  const brandNew = tasks.filter((t) => !prevSet.has(t.sId));
  const brandNewIds = sortProjectTasksForInitialDisplay(brandNew).map(
    (t) => t.sId
  );
  return [...brandNewIds, ...kept];
}

export function orderProjectTasksBySIdList(
  orderedSIds: string[],
  tasks: ProjectTaskType[]
): ProjectTaskType[] {
  const byId = new Map(tasks.map((t) => [t.sId, t]));
  return orderedSIds
    .map((id) => byId.get(id))
    .filter((t): t is ProjectTaskType => t !== undefined);
}

export function compareProjectTaskAssignees(
  a: ProjectTaskAssigneeType | null,
  b: ProjectTaskAssigneeType | null,
  viewerUserId: string | null
): number {
  const aUnassigned = a === null;
  const bUnassigned = b === null;
  if (aUnassigned !== bUnassigned) {
    return aUnassigned ? -1 : 1;
  }
  const aIsViewer = viewerUserId !== null && a?.sId === viewerUserId;
  const bIsViewer = viewerUserId !== null && b?.sId === viewerUserId;
  if (aIsViewer !== bIsViewer) {
    return aIsViewer ? -1 : 1;
  }
  const aName = a?.fullName ?? PROJECT_TASK_NO_ASSIGNEE_LABEL;
  const bName = b?.fullName ?? PROJECT_TASK_NO_ASSIGNEE_LABEL;
  return aName.localeCompare(bName, undefined, { sensitivity: "base" });
}

/**
 * Per-assignee stable order (initial sort, then stable across SWR revalidations), then
 * flattened in the same assignee group order as the project tasks UI.
 */
export function flattenProjectTasksWithStableAssigneeOrder(
  rawTasks: ProjectTaskType[],
  viewerUserId: string | null,
  stableOrderByAssigneeKey: Map<string, string[]>
): ProjectTaskType[] {
  const groups = new Map<
    string,
    { user: ProjectTaskAssigneeType | null; tasks: ProjectTaskType[] }
  >();

  for (const task of rawTasks) {
    const user = task.user ?? null;
    const key = user?.sId ?? PROJECT_TASK_UNASSIGNED_GROUP_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(key, { user, tasks: [task] });
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    compareProjectTaskAssignees(a.user, b.user, viewerUserId)
  );

  const flattened: ProjectTaskType[] = [];
  for (const group of sortedGroups) {
    const key = group.user?.sId ?? PROJECT_TASK_UNASSIGNED_GROUP_KEY;
    const prev = stableOrderByAssigneeKey.get(key);
    const mergedIds = mergeProjectTaskStableOrder(prev, group.tasks);
    stableOrderByAssigneeKey.set(key, mergedIds);
    flattened.push(...orderProjectTasksBySIdList(mergedIds, group.tasks));
  }
  return flattened;
}
