import {
  POD_TASK_NO_ASSIGNEE_LABEL,
  POD_TASK_UNASSIGNED_GROUP_KEY,
  type PodTaskAssigneeType,
  type PodTaskStatus,
  type PodTaskType,
} from "@app/types/project_task";

const POD_TASK_STATUS_SORT_RANK: Record<PodTaskStatus, number> = {
  in_progress: 0,
  todo: 1,
  done: 2,
};

function podTaskUpdatedAtMs(t: PodTaskType): number {
  const u = t.updatedAt;
  if (u instanceof Date) {
    return u.getTime();
  }
  return new Date(String(u)).getTime();
}

/** In progress → Open → Done, then `updatedAt` descending. Used on first load per assignee group. */
function sortPodTasksForInitialDisplay(tasks: PodTaskType[]): PodTaskType[] {
  return [...tasks].sort((a, b) => {
    const rankDiff =
      POD_TASK_STATUS_SORT_RANK[a.status] - POD_TASK_STATUS_SORT_RANK[b.status];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return podTaskUpdatedAtMs(b) - podTaskUpdatedAtMs(a);
  });
}

/**
 * Preserves a previously shown order on revalidation; new items (not in `prevOrderedSIds`)
 * are prepended, ordered among themselves with {@link sortPodTasksForInitialDisplay}.
 */
function mergePodTaskStableOrder(
  prevOrderedSIds: string[] | undefined,
  tasks: PodTaskType[]
): string[] {
  const currentSet = new Set(tasks.map((t) => t.sId));

  if (!prevOrderedSIds || prevOrderedSIds.length === 0) {
    return sortPodTasksForInitialDisplay(tasks).map((t) => t.sId);
  }

  const prevSet = new Set(prevOrderedSIds);
  const kept = prevOrderedSIds.filter((id) => currentSet.has(id));
  const brandNew = tasks.filter((t) => !prevSet.has(t.sId));
  const brandNewIds = sortPodTasksForInitialDisplay(brandNew).map((t) => t.sId);
  return [...brandNewIds, ...kept];
}

function orderPodTasksBySIdList(
  orderedSIds: string[],
  tasks: PodTaskType[]
): PodTaskType[] {
  const byId = new Map(tasks.map((t) => [t.sId, t]));
  return orderedSIds
    .map((id) => byId.get(id))
    .filter((t): t is PodTaskType => t !== undefined);
}

export function comparePodTaskAssignees(
  a: PodTaskAssigneeType | null,
  b: PodTaskAssigneeType | null,
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
  const aName = a?.fullName ?? POD_TASK_NO_ASSIGNEE_LABEL;
  const bName = b?.fullName ?? POD_TASK_NO_ASSIGNEE_LABEL;
  return aName.localeCompare(bName, undefined, { sensitivity: "base" });
}

/**
 * Per-assignee stable order (initial sort, then stable across SWR revalidations), then
 * flattened in the same assignee group order as the project tasks UI.
 */
export function flattenPodTasksWithStableAssigneeOrder(
  rawTasks: PodTaskType[],
  viewerUserId: string | null,
  stableOrderByAssigneeKey: Map<string, string[]>
): PodTaskType[] {
  const groups = new Map<
    string,
    { user: PodTaskAssigneeType | null; tasks: PodTaskType[] }
  >();

  for (const task of rawTasks) {
    const user = task.user ?? null;
    const key = user?.sId ?? POD_TASK_UNASSIGNED_GROUP_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(key, { user, tasks: [task] });
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    comparePodTaskAssignees(a.user, b.user, viewerUserId)
  );

  const flattened: PodTaskType[] = [];
  for (const group of sortedGroups) {
    const key = group.user?.sId ?? POD_TASK_UNASSIGNED_GROUP_KEY;
    const prev = stableOrderByAssigneeKey.get(key);
    const mergedIds = mergePodTaskStableOrder(prev, group.tasks);
    stableOrderByAssigneeKey.set(key, mergedIds);
    flattened.push(...orderPodTasksBySIdList(mergedIds, group.tasks));
  }
  return flattened;
}
