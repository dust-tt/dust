import type { TodoForDiff } from "@app/lib/butler/project_todo_diff";
import {
  computeProjectTodoDiff,
  getLatestVersionPerSId,
  getSnapshotAtCutoff,
} from "@app/lib/butler/project_todo_diff";
import { describe, expect, it } from "vitest";

const T0 = new Date("2025-01-01T00:00:00Z"); // before cutoff
const T1 = new Date("2025-06-01T00:00:00Z"); // cutoff
const T2 = new Date("2025-12-01T00:00:00Z"); // after cutoff

let _nextSId = 1;
function nextSId(): string {
  return `todo_${_nextSId++}`;
}

function makeRow(
  overrides: Partial<TodoForDiff> & { sId?: string } = {}
): TodoForDiff {
  return {
    sId: overrides.sId ?? nextSId(),
    version: 1,
    createdAt: T0,
    status: "todo",
    doneAt: null,
    ...overrides,
  };
}

// ── getLatestVersionPerSId ─────────────────────────────────────────────────────

describe("getLatestVersionPerSId", () => {
  it("returns the highest-version row for each sId", () => {
    const sId = nextSId();
    const v1 = makeRow({ sId, version: 1 });
    const v2 = makeRow({ sId, version: 2, status: "done" });
    const v3 = makeRow({ sId, version: 3, status: "in_progress" });

    const result = getLatestVersionPerSId([v1, v3, v2]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(v3);
  });

  it("handles multiple distinct sIds", () => {
    const a1 = makeRow({ sId: "a", version: 1 });
    const a2 = makeRow({ sId: "a", version: 2 });
    const b1 = makeRow({ sId: "b", version: 1 });

    const result = getLatestVersionPerSId([a1, a2, b1]);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.sId === "a")).toBe(a2);
    expect(result.find((r) => r.sId === "b")).toBe(b1);
  });

  it("returns an empty array for empty input", () => {
    expect(getLatestVersionPerSId([])).toHaveLength(0);
  });
});

// ── getSnapshotAtCutoff ────────────────────────────────────────────────────────

describe("getSnapshotAtCutoff", () => {
  it("picks the latest version created at or before the cutoff", () => {
    const sId = nextSId();
    const v1 = makeRow({ sId, version: 1, createdAt: T0 }); // before cutoff
    const v2 = makeRow({ sId, version: 2, createdAt: T2 }); // after cutoff

    const snapshot = getSnapshotAtCutoff([v1, v2], T1);

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toBe(v1);
  });

  it("excludes sIds whose first version was created after the cutoff", () => {
    const row = makeRow({ createdAt: T2 });
    expect(getSnapshotAtCutoff([row], T1)).toHaveLength(0);
  });

  it("includes a row created exactly at the cutoff", () => {
    const row = makeRow({ createdAt: T1 });
    expect(getSnapshotAtCutoff([row], T1)).toHaveLength(1);
  });
});

// ── computeProjectTodoDiff ────────────────────────────────────────────────────

describe("computeProjectTodoDiff", () => {
  it("marks todos absent from before as added", () => {
    const todo = makeRow();
    const diff = computeProjectTodoDiff([], [todo]);

    expect(diff.added).toContain(todo);
    expect(diff.completed).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it("marks todos with the same version as unchanged", () => {
    const sId = nextSId();
    const before = makeRow({ sId, version: 1 });
    const after = makeRow({ sId, version: 1 });

    const diff = computeProjectTodoDiff([before], [after]);

    expect(diff.unchanged).toContain(after);
    expect(diff.added).toHaveLength(0);
    expect(diff.completed).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
  });

  it("marks as completed when version bumped and status moved to done", () => {
    const sId = nextSId();
    const before = makeRow({ sId, version: 1, status: "todo" });
    const after = makeRow({ sId, version: 2, status: "done", doneAt: T2 });

    const diff = computeProjectTodoDiff([before], [after]);

    expect(diff.completed).toContain(after);
    expect(diff.added).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it("marks as updated when version bumped but not completed", () => {
    const sId = nextSId();
    const before = makeRow({ sId, version: 1, status: "todo" });
    const after = makeRow({ sId, version: 2, status: "in_progress" });

    const diff = computeProjectTodoDiff([before], [after]);

    expect(diff.updated).toContain(after);
    expect(diff.completed).toHaveLength(0);
  });

  it("does not confuse completed→done before cutoff as completed", () => {
    // Todo was already done in the before snapshot — same version in after → unchanged.
    const sId = nextSId();
    const before = makeRow({ sId, version: 2, status: "done", doneAt: T0 });
    const after = makeRow({ sId, version: 2, status: "done", doneAt: T0 });

    const diff = computeProjectTodoDiff([before], [after]);

    expect(diff.unchanged).toContain(after);
    expect(diff.completed).toHaveLength(0);
  });

  it("handles empty before and after", () => {
    const diff = computeProjectTodoDiff([], []);
    expect(diff.added).toHaveLength(0);
    expect(diff.completed).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it("correctly splits a mixed batch", () => {
    const addedTodo = makeRow();
    const completedSId = nextSId();
    const updatedSId = nextSId();
    const unchangedSId = nextSId();

    const before = [
      makeRow({ sId: completedSId, version: 1, status: "todo" }),
      makeRow({ sId: updatedSId, version: 1, status: "todo" }),
      makeRow({ sId: unchangedSId, version: 1 }),
    ];

    const after = [
      addedTodo,
      makeRow({ sId: completedSId, version: 2, status: "done", doneAt: T2 }),
      makeRow({ sId: updatedSId, version: 2, status: "in_progress" }),
      makeRow({ sId: unchangedSId, version: 1 }),
    ];

    const diff = computeProjectTodoDiff(before, after);

    expect(diff.added).toHaveLength(1);
    expect(diff.completed).toHaveLength(1);
    expect(diff.updated).toHaveLength(1);
    expect(diff.unchanged).toHaveLength(1);
  });

  it("preserves the original after-todo objects (no copying)", () => {
    const todo = makeRow();
    const diff = computeProjectTodoDiff([], [todo]);
    expect(diff.added[0]).toBe(todo);
  });
});

// ── end-to-end: getSnapshotAtCutoff + computeProjectTodoDiff ──────────────────

describe("snapshot-based diff end-to-end", () => {
  it("detects an edit made after the cutoff using version rows", () => {
    const sId = nextSId();
    const v1 = makeRow({ sId, version: 1, createdAt: T0, status: "todo" });
    const v2 = makeRow({
      sId,
      version: 2,
      createdAt: T2,
      status: "in_progress",
    });

    const allRows = [v1, v2];
    const afterTodos = getLatestVersionPerSId(allRows); // [v2]
    const beforeTodos = getSnapshotAtCutoff(allRows, T1); // [v1]

    const diff = computeProjectTodoDiff(beforeTodos, afterTodos);

    expect(diff.updated).toHaveLength(1);
    expect(diff.unchanged).toHaveLength(0);
  });

  it("marks a todo as added when all its versions were created after the cutoff", () => {
    const sId = nextSId();
    const v1 = makeRow({ sId, version: 1, createdAt: T2 });

    const allRows = [v1];
    const afterTodos = getLatestVersionPerSId(allRows);
    const beforeTodos = getSnapshotAtCutoff(allRows, T1);

    const diff = computeProjectTodoDiff(beforeTodos, afterTodos);

    expect(diff.added).toHaveLength(1);
  });
});
