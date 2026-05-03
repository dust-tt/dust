import type {
  ProjectTodoAssigneeType,
  ProjectTodoStatus,
  ProjectTodoType,
} from "@app/types/project_todo";

const PROJECT_TODO_STATUS_SORT_RANK: Record<ProjectTodoStatus, number> = {
  in_progress: 0,
  todo: 1,
  done: 2,
};

function projectTodoUpdatedAtMs(t: ProjectTodoType): number {
  const u = t.updatedAt;
  if (u instanceof Date) {
    return u.getTime();
  }
  return new Date(String(u)).getTime();
}

/** In progress → Open → Done, then `updatedAt` descending. Used on first load per assignee group. */
export function sortProjectTodosForInitialDisplay(
  todos: ProjectTodoType[]
): ProjectTodoType[] {
  return [...todos].sort((a, b) => {
    const rankDiff =
      PROJECT_TODO_STATUS_SORT_RANK[a.status] -
      PROJECT_TODO_STATUS_SORT_RANK[b.status];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return projectTodoUpdatedAtMs(b) - projectTodoUpdatedAtMs(a);
  });
}

/**
 * Preserves a previously shown order on revalidation; new items (not in `prevOrderedSIds`)
 * are prepended, ordered among themselves with {@link sortProjectTodosForInitialDisplay}.
 */
export function mergeProjectTodoStableOrder(
  prevOrderedSIds: string[] | undefined,
  todos: ProjectTodoType[]
): string[] {
  const currentSet = new Set(todos.map((t) => t.sId));

  if (!prevOrderedSIds || prevOrderedSIds.length === 0) {
    return sortProjectTodosForInitialDisplay(todos).map((t) => t.sId);
  }

  const prevSet = new Set(prevOrderedSIds);
  const kept = prevOrderedSIds.filter((id) => currentSet.has(id));
  const brandNew = todos.filter((t) => !prevSet.has(t.sId));
  const brandNewIds = sortProjectTodosForInitialDisplay(brandNew).map(
    (t) => t.sId
  );
  return [...brandNewIds, ...kept];
}

export function orderProjectTodosBySIdList(
  orderedSIds: string[],
  todos: ProjectTodoType[]
): ProjectTodoType[] {
  const byId = new Map(todos.map((t) => [t.sId, t]));
  return orderedSIds
    .map((id) => byId.get(id))
    .filter((t): t is ProjectTodoType => t !== undefined);
}

export function compareProjectTodoAssigneeGroups(
  a: { user: ProjectTodoAssigneeType | null },
  b: { user: ProjectTodoAssigneeType | null },
  viewerUserId: string | null
): number {
  const aIsViewer = viewerUserId !== null && a.user?.sId === viewerUserId;
  const bIsViewer = viewerUserId !== null && b.user?.sId === viewerUserId;
  if (aIsViewer !== bIsViewer) {
    return aIsViewer ? -1 : 1;
  }
  const aName = a.user?.fullName ?? "";
  const bName = b.user?.fullName ?? "";
  return aName.localeCompare(bName, undefined, { sensitivity: "base" });
}

/**
 * Per-assignee stable order (initial sort, then stable across SWR revalidations), then
 * flattened in the same assignee group order as the project to-dos UI.
 */
export function flattenProjectTodosWithStableAssigneeOrder(
  rawTodos: ProjectTodoType[],
  viewerUserId: string | null,
  stableOrderByAssigneeKey: Map<string, string[]>
): ProjectTodoType[] {
  const groups = new Map<
    string,
    { user: ProjectTodoAssigneeType | null; todos: ProjectTodoType[] }
  >();

  for (const todo of rawTodos) {
    const user = todo.user ?? null;
    const key = user?.sId ?? `unknown-${todo.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.todos.push(todo);
    } else {
      groups.set(key, { user, todos: [todo] });
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    compareProjectTodoAssigneeGroups(a, b, viewerUserId)
  );

  const flattened: ProjectTodoType[] = [];
  for (const group of sortedGroups) {
    const key = group.user?.sId ?? `unknown-${group.todos[0]?.id}`;
    const prev = stableOrderByAssigneeKey.get(key);
    const mergedIds = mergeProjectTodoStableOrder(prev, group.todos);
    stableOrderByAssigneeKey.set(key, mergedIds);
    flattened.push(...orderProjectTodosBySIdList(mergedIds, group.todos));
  }
  return flattened;
}
