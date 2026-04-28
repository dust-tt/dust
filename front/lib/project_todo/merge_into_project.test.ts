import type { Authenticator } from "@app/lib/auth";
import {
  actionItemBlob,
  mergeUpdateIntentsByTodoId,
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

// ── mergeUpdateIntentsByTodoId ────────────────────────────────────────────────

type StubBlob = {
  text: string;
  status: "todo" | "done";
  doneAt: Date | null;
  reasoningDoneAt: string | null;
};

type IntentStub = {
  todo: { id: ModelId };
  itemId: string;
  blob: StubBlob;
};

function makeStubBlob(overrides: Partial<StubBlob> = {}): StubBlob {
  return {
    text: "default text",
    status: "todo",
    doneAt: null,
    reasoningDoneAt: null,
    ...overrides,
  };
}

function makeIntent(
  todoId: number,
  itemId: string,
  blobOverrides: Partial<StubBlob> = {}
): IntentStub {
  return {
    todo: { id: todoId as ModelId },
    itemId,
    blob: makeStubBlob(blobOverrides),
  };
}

describe("mergeUpdateIntentsByTodoId", () => {
  it("returns an empty array when there are no intents", () => {
    expect(mergeUpdateIntentsByTodoId([])).toEqual([]);
  });

  it("keeps a single intent's blob as-is for a single todo", () => {
    const intent = makeIntent(1, "item-a", { text: "only" });
    const result = mergeUpdateIntentsByTodoId([intent]);
    expect(result).toEqual([{ todo: intent.todo, blob: intent.blob }]);
  });

  it("emits one merged update per distinct todo, with text from the smallest itemId", () => {
    // Reproduces the version-churn case: 3 sources on the same todo with
    // different wording. The merged text must come from the smallest-itemId
    // source so it stays stable across runs.
    const intents = [
      makeIntent(42, "item-c", { text: "third phrasing" }),
      makeIntent(42, "item-a", { text: "first phrasing" }),
      makeIntent(42, "item-b", { text: "second phrasing" }),
    ];

    const result = mergeUpdateIntentsByTodoId(intents);

    expect(result).toHaveLength(1);
    expect(result[0].blob.text).toBe("first phrasing");
  });

  it("emits one merged update per distinct todo", () => {
    const intents = [
      makeIntent(1, "item-z", { text: "todo1-z" }),
      makeIntent(2, "item-q", { text: "todo2-q" }),
      makeIntent(1, "item-a", { text: "todo1-a" }),
      makeIntent(1, "item-m", { text: "todo1-m" }),
    ];

    const result = mergeUpdateIntentsByTodoId(intents);
    const byTodoId = new Map(result.map((r) => [r.todo.id, r]));

    expect(result).toHaveLength(2);
    expect(byTodoId.get(1 as ModelId)?.blob.text).toBe("todo1-a");
    expect(byTodoId.get(2 as ModelId)?.blob.text).toBe("todo2-q");
  });

  it("keeps status='todo' when no source reports done", () => {
    const intents = [
      makeIntent(1, "item-a", { status: "todo", text: "stable" }),
      makeIntent(1, "item-b", { status: "todo", text: "other" }),
    ];

    const [r] = mergeUpdateIntentsByTodoId(intents);

    expect(r.blob.status).toBe("todo");
    expect(r.blob.doneAt).toBeNull();
    expect(r.blob.reasoningDoneAt).toBeNull();
    expect(r.blob.text).toBe("stable");
  });

  it("flips to 'done' when any source reports done, even if it is not the text primary", () => {
    // Concrete scenario behind this rule: the smallest-itemId source still
    // reports the task as open, but a later takeaway extracted the same task
    // and detected it as done. The "done" signal must propagate.
    const doneAt = new Date("2026-04-22T00:00:00.000Z");
    const intents = [
      makeIntent(1, "item-a", { status: "todo", text: "stable text" }),
      makeIntent(1, "item-b", {
        status: "done",
        doneAt,
        reasoningDoneAt: "completed in PR #123",
        text: "alternate phrasing",
      }),
    ];

    const [r] = mergeUpdateIntentsByTodoId(intents);

    expect(r.blob.status).toBe("done");
    expect(r.blob.doneAt).toEqual(doneAt);
    expect(r.blob.reasoningDoneAt).toBe("completed in PR #123");
    // Text stays from the smallest-itemId source for stability.
    expect(r.blob.text).toBe("stable text");
  });

  it("uses the smallest-itemId done source for status fields when multiple sources report done", () => {
    const earlier = new Date("2026-04-20T00:00:00.000Z");
    const later = new Date("2026-04-22T00:00:00.000Z");
    const intents = [
      makeIntent(1, "item-a", { status: "todo", text: "stable text" }),
      makeIntent(1, "item-c", {
        status: "done",
        doneAt: later,
        reasoningDoneAt: "reason-c",
      }),
      makeIntent(1, "item-b", {
        status: "done",
        doneAt: earlier,
        reasoningDoneAt: "reason-b",
      }),
    ];

    const [r] = mergeUpdateIntentsByTodoId(intents);

    expect(r.blob.status).toBe("done");
    expect(r.blob.doneAt).toEqual(earlier);
    expect(r.blob.reasoningDoneAt).toBe("reason-b");
    expect(r.blob.text).toBe("stable text");
  });

  it("is order-independent (same input set → same merged result regardless of input order)", () => {
    const a = makeIntent(7, "item-a", { text: "A", status: "todo" });
    const b = makeIntent(7, "item-b", {
      text: "B",
      status: "done",
      doneAt: new Date("2026-04-22T00:00:00.000Z"),
      reasoningDoneAt: "rb",
    });
    const c = makeIntent(7, "item-c", { text: "C", status: "todo" });

    const r1 = mergeUpdateIntentsByTodoId([a, b, c]);
    const r2 = mergeUpdateIntentsByTodoId([c, b, a]);
    const r3 = mergeUpdateIntentsByTodoId([b, c, a]);

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    // Sanity: text from a (smallest itemId), status fields from b (only done).
    expect(r1[0].blob.text).toBe("A");
    expect(r1[0].blob.status).toBe("done");
    expect(r1[0].blob.reasoningDoneAt).toBe("rb");
  });
});
