import type { Authenticator } from "@app/lib/auth";
import {
  actionItemBlob,
  dedupeUpdateIntentsByTodoId,
  updateTodoIfChanged,
} from "@app/lib/project_todo/merge_into_project";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type {
  ProjectTodoActorType,
  ProjectTodoStatus,
} from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { describe, expect, it, vi } from "vitest";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActionItem(
  overrides: Partial<TodoVersionedActionItem> = {}
): TodoVersionedActionItem {
  return {
    sId: "action-1",
    shortDescription: "Write the report",
    assigneeUserId: null,
    assigneeName: null,
    status: "open",
    detectedDoneAt: null,
    detectedDoneRationale: null,
    ...overrides,
  };
}

// ── actionItemBlob ────────────────────────────────────────────────────────────

describe("actionItemBlob", () => {
  it("maps open status to todo", () => {
    const blob = actionItemBlob(makeActionItem({ status: "open" }));
    expect(blob.status).toBe("todo");
    expect(blob.doneAt).toBeNull();
  });

  it("maps done status to done and parses detectedDoneAt", () => {
    const doneAt = "2024-06-15T10:00:00.000Z";
    const blob = actionItemBlob(
      makeActionItem({ status: "done", detectedDoneAt: doneAt })
    );
    expect(blob.status).toBe("done");
    expect(blob.doneAt).toEqual(new Date(doneAt));
  });

  it("sets doneAt to null when done but detectedDoneAt is absent", () => {
    const blob = actionItemBlob(
      makeActionItem({ status: "done", detectedDoneAt: null })
    );
    expect(blob.status).toBe("done");
    expect(blob.doneAt).toBeNull();
  });

  it("preserves shortDescription", () => {
    const blob = actionItemBlob(
      makeActionItem({ shortDescription: "Deploy to prod" })
    );
    expect(blob.text).toBe("Deploy to prod");
  });
});

// ── updateTodoIfChanged ───────────────────────────────────────────────────────

type TodoStub = {
  createdByType: ProjectTodoActorType;
  markedAsDoneByType: ProjectTodoActorType | null;
  text: string;
  status: ProjectTodoStatus;
  doneAt: Date | null;
  actorRationale: string | null;
  updateWithVersion: ReturnType<typeof vi.fn>;
};

function makeTodoStub(overrides: Partial<TodoStub> = {}): TodoStub {
  return {
    createdByType: "agent",
    markedAsDoneByType: null,
    text: "Write the report",
    status: "todo",
    doneAt: null,
    actorRationale: null,
    updateWithVersion: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeBlob(
  overrides: Partial<{
    text: string;
    status: "todo" | "done";
    doneAt: Date | null;
    reasoningDoneAt: string | null;
  }> = {}
) {
  return {
    text: "Write the report",
    status: "todo" as const,
    doneAt: null,
    reasoningDoneAt: null,
    ...overrides,
  };
}

// Auth is not touched on the early-return paths; on the update path it is
// forwarded to updateWithVersion, which is a spy here.
const fakeAuth = {} as Authenticator;

describe("updateTodoIfChanged", () => {
  it("returns false and does not update a user-created todo even when content changed", async () => {
    const todo = makeTodoStub({ createdByType: "user", text: "Old text" });
    const blob = makeBlob({ text: "New text" });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(false);
    expect(todo.updateWithVersion).not.toHaveBeenCalled();
  });

  it("returns false and does not update an agent-created todo that was marked done by a user", async () => {
    // Concrete scenario: agent created the todo, user marked it done, next
    // extraction still sees the underlying item as open. The user's completion
    // must stick — no revert.
    const todo = makeTodoStub({
      createdByType: "agent",
      markedAsDoneByType: "user",
      status: "done",
      doneAt: new Date("2026-04-20T10:00:00.000Z"),
    });
    const blob = makeBlob({ status: "todo", doneAt: null });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(false);
    expect(todo.updateWithVersion).not.toHaveBeenCalled();
  });

  it("returns false when nothing changed on an agent-created todo", async () => {
    const todo = makeTodoStub({
      text: "Write the report",
      status: "todo",
      doneAt: null,
    });
    const blob = makeBlob({
      text: "Write the report",
      status: "todo",
      doneAt: null,
    });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(false);
    expect(todo.updateWithVersion).not.toHaveBeenCalled();
  });

  it("updates an agent-created todo when the text changed", async () => {
    const todo = makeTodoStub({ text: "Old text" });
    const blob = makeBlob({ text: "New text" });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(true);
    expect(todo.updateWithVersion).toHaveBeenCalledTimes(1);
    expect(todo.updateWithVersion).toHaveBeenCalledWith(fakeAuth, {
      text: "New text",
      status: "todo",
      doneAt: null,
      actorRationale: null,
    });
  });

  it("updates an agent-created todo when the status flipped open→done (agent detection)", async () => {
    const doneAt = new Date("2026-04-21T12:00:00.000Z");
    const todo = makeTodoStub({ status: "todo", doneAt: null });
    const blob = makeBlob({ status: "done", doneAt });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(true);
    expect(todo.updateWithVersion).toHaveBeenCalledWith(fakeAuth, {
      text: "Write the report",
      status: "done",
      doneAt,
      actorRationale: null,
    });
  });

  it("updates an agent-created todo marked done by an agent (not a user)", async () => {
    // Agent-marked completions are not treated as user-owned — the next
    // extraction can still correct them (e.g. flip back to open).
    const todo = makeTodoStub({
      markedAsDoneByType: "agent",
      status: "done",
      doneAt: new Date("2026-04-20T10:00:00.000Z"),
    });
    const blob = makeBlob({ status: "todo", doneAt: null });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(true);
    expect(todo.updateWithVersion).toHaveBeenCalledWith(fakeAuth, {
      text: "Write the report",
      status: "todo",
      doneAt: null,
      actorRationale: null,
    });
  });
});

// ── dedupeUpdateIntentsByTodoId ───────────────────────────────────────────────

// Structural stub for intents — the helper only reads `todo.id` and `itemId`.
type IntentStub = {
  todo: { id: ModelId };
  itemId: string;
  tag: string;
};

function makeIntent(todoId: number, itemId: string, tag: string): IntentStub {
  return { todo: { id: todoId as ModelId }, itemId, tag };
}

describe("dedupeUpdateIntentsByTodoId", () => {
  it("returns an empty array when there are no intents", () => {
    expect(dedupeUpdateIntentsByTodoId([])).toEqual([]);
  });

  it("keeps a single intent for a single todo as-is", () => {
    const intent = makeIntent(1, "item-a", "only");
    expect(dedupeUpdateIntentsByTodoId([intent])).toEqual([intent]);
  });

  it("collapses multiple intents on the same todo to the smallest itemId", () => {
    // Reproduces the version-churn bug: same todo linked to 3 sources whose
    // action items have different content. Only the smallest-itemId intent
    // should survive so the picked content is stable across merge runs.
    const intents = [
      makeIntent(42, "item-c", "third"),
      makeIntent(42, "item-a", "first"),
      makeIntent(42, "item-b", "second"),
    ];

    const result = dedupeUpdateIntentsByTodoId(intents);

    expect(result).toHaveLength(1);
    expect(result[0].itemId).toBe("item-a");
    expect(result[0].tag).toBe("first");
  });

  it("emits one survivor per distinct todo", () => {
    // Two todos, three intents on the first one and one on the second.
    const intents = [
      makeIntent(1, "item-z", "todo1-z"),
      makeIntent(2, "item-q", "todo2-q"),
      makeIntent(1, "item-a", "todo1-a"),
      makeIntent(1, "item-m", "todo1-m"),
    ];

    const result = dedupeUpdateIntentsByTodoId(intents);
    const byTodoId = new Map(result.map((i) => [i.todo.id, i]));

    expect(result).toHaveLength(2);
    expect(byTodoId.get(1 as ModelId)?.itemId).toBe("item-a");
    expect(byTodoId.get(2 as ModelId)?.itemId).toBe("item-q");
  });

  it("is order-independent (same input set → same survivor regardless of input order)", () => {
    // Stability property: the result must not depend on the order intents
    // were collected in (e.g. across parallel takeaway processing).
    const a = makeIntent(7, "item-a", "a");
    const b = makeIntent(7, "item-b", "b");
    const c = makeIntent(7, "item-c", "c");

    const r1 = dedupeUpdateIntentsByTodoId([a, b, c]);
    const r2 = dedupeUpdateIntentsByTodoId([c, b, a]);
    const r3 = dedupeUpdateIntentsByTodoId([b, c, a]);

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    expect(r1[0].itemId).toBe("item-a");
  });
});
