import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import type { ProjectTodoStatus } from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Minimal shape required by the diff helpers. Using a structural interface keeps
 * the pure functions easy to unit-test with plain objects.
 */
export interface TodoForDiff {
  sId: string; // stable identity — same across all version rows of one todo
  version: number; // edit counter; higher = newer
  createdAt: Date; // when this specific version row was inserted
  status: ProjectTodoStatus;
  doneAt: Date | null;
}

export type ProjectTodoDiff<T extends TodoForDiff = ProjectTodoResource> = {
  /** New todos that did not exist at the cutoff. */
  added: T[];
  /** Todos that existed before the cutoff and were marked done since. */
  completed: T[];
  /** Todos that existed before the cutoff and were updated (but not completed) since. */
  updated: T[];
  /** Todos that existed before the cutoff with no changes since. */
  unchanged: T[];
};

// ── Snapshot helpers ───────────────────────────────────────────────────────────

/**
 * Given a flat list of version rows (multiple rows per sId), return one row per
 * sId — the one with the highest version number.
 */
export function getLatestVersionPerSId<
  T extends Pick<TodoForDiff, "sId" | "version">,
>(rows: T[]): T[] {
  // GEN7: O(n) with a Map instead of nested loops.
  const map = new Map<string, T>();
  for (const row of rows) {
    const current = map.get(row.sId);
    if (!current || row.version > current.version) {
      map.set(row.sId, row);
    }
  }
  return [...map.values()];
}

/**
 * From a flat list of all version rows, reconstruct the state that was visible
 * at `cutoffAt`: for each sId, the latest version whose row was created at or
 * before the cutoff.
 */
export function getSnapshotAtCutoff<
  T extends Pick<TodoForDiff, "sId" | "version" | "createdAt">,
>(allRows: T[], cutoffAt: Date): T[] {
  const eligible = allRows.filter((r) => r.createdAt <= cutoffAt);
  return getLatestVersionPerSId(eligible);
}

// ── Pure algorithm ─────────────────────────────────────────────────────────────

/**
 * Compute the diff between two snapshots joined by `sId`.
 *
 * Each todo in `afterTodos` is placed in exactly one bucket:
 *  - added     — sId absent from beforeTodos (todo is new)
 *  - completed — sId present in both; version bumped; now "done" but wasn't before
 *  - updated   — sId present in both; version bumped; any other change
 *  - unchanged — sId present in both; same version (no edit since cutoff)
 *
 * Both input arrays should contain at most one entry per sId (i.e. the latest
 * version at the relevant point in time). Use `getLatestVersionPerSId` and
 * `getSnapshotAtCutoff` to prepare them from raw version rows.
 */
export function computeProjectTodoDiff<T extends TodoForDiff>(
  beforeTodos: T[],
  afterTodos: T[]
): ProjectTodoDiff<T> {
  // GEN7: O(n) Map lookup.
  const beforeMap = new Map(beforeTodos.map((t) => [t.sId, t]));

  const added: T[] = [];
  const completed: T[] = [];
  const updated: T[] = [];
  const unchanged: T[] = [];

  for (const after of afterTodos) {
    const before = beforeMap.get(after.sId);

    if (!before) {
      added.push(after);
    } else if (after.version === before.version) {
      unchanged.push(after);
    } else if (after.status === "done" && before.status !== "done") {
      completed.push(after);
    } else {
      updated.push(after);
    }
  }

  return { added, completed, updated, unchanged };
}

// ── Data fetching ──────────────────────────────────────────────────────────────

/**
 * Raw data needed to drive the diff: every version row for the user's todos in
 * this space, plus the last-read cutoff date.
 *
 * Separated from the algorithm so the pure functions can be unit-tested without
 * database access.
 */
export interface ProjectTodoDiffData {
  allRows: ProjectTodoResource[];
  cutoffAt: Date | null;
}

export async function fetchProjectTodoDiffData(
  auth: Authenticator,
  { spaceId }: { spaceId: ModelId }
): Promise<ProjectTodoDiffData> {
  // Two independent DB reads — static 2-tuple, Promise.all is safe here.
  const [allRows, state] = await Promise.all([
    ProjectTodoResource.fetchAllVersionsBySpace(auth, {
      spaceId,
    }),
    ProjectTodoStateResource.fetchBySpace(auth, { spaceId }),
  ]);

  return { allRows, cutoffAt: state?.lastReadAt ?? null };
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

/**
 * Compute the todo diff for the authenticated user in a given space.
 *
 * For unit-testing, call `computeProjectTodoDiff` directly with plain objects,
 * or use `getLatestVersionPerSId` / `getSnapshotAtCutoff` to prepare snapshots.
 */
export async function getProjectTodoDiff(
  auth: Authenticator,
  { spaceId }: { spaceId: ModelId }
): Promise<ProjectTodoDiff> {
  const { allRows, cutoffAt } = await fetchProjectTodoDiffData(auth, {
    spaceId,
  });

  const afterTodos = getLatestVersionPerSId(allRows);
  const beforeTodos =
    cutoffAt !== null ? getSnapshotAtCutoff(allRows, cutoffAt) : [];

  return computeProjectTodoDiff(beforeTodos, afterTodos);
}
