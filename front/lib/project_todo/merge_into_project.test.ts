import type { Authenticator } from "@app/lib/auth";
import {
  actionItemBlob,
  keyDecisionBlob,
  notableFactBlob,
  updateTodoIfChanged,
} from "@app/lib/project_todo/merge_into_project";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type {
  ProjectTodoActorType,
  ProjectTodoCategory,
  ProjectTodoStatus,
} from "@app/types/project_todo";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";
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

function makeKeyDecision(
  overrides: Partial<TodoVersionedKeyDecision> = {}
): TodoVersionedKeyDecision {
  return {
    sId: "decision-1",
    shortDescription: "Use PostgreSQL",
    relevantUserIds: [],
    status: "decided",
    ...overrides,
  };
}

function makeNotableFact(
  overrides: Partial<TodoVersionedNotableFact> = {}
): TodoVersionedNotableFact {
  return {
    sId: "fact-1",
    shortDescription: "Budget capped at €50k",
    relevantUserIds: [],
    ...overrides,
  };
}

// ── actionItemBlob ────────────────────────────────────────────────────────────

describe("actionItemBlob", () => {
  it("maps to to_do category", () => {
    const blob = actionItemBlob(makeActionItem());
    expect(blob.category).toBe("to_do");
  });

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

// ── keyDecisionBlob ───────────────────────────────────────────────────────────

describe("keyDecisionBlob", () => {
  it("maps to to_know category", () => {
    const blob = keyDecisionBlob(makeKeyDecision());
    expect(blob.category).toBe("to_know");
  });

  it("maps decided status to done", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ status: "decided" }));
    expect(blob.status).toBe("todo");
  });

  it("maps open status to todo", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ status: "open" }));
    expect(blob.status).toBe("todo");
  });

  it("always sets doneAt to null", () => {
    const blob = keyDecisionBlob(makeKeyDecision({ status: "decided" }));
    expect(blob.doneAt).toBeNull();
  });

  it("preserves text", () => {
    const blob = keyDecisionBlob(
      makeKeyDecision({ shortDescription: "Go monorepo" })
    );
    expect(blob.text).toBe("Go monorepo");
  });
});

// ── notableFactBlob ───────────────────────────────────────────────────────────

describe("notableFactBlob", () => {
  it("maps to to_know category", () => {
    const blob = notableFactBlob(makeNotableFact());
    expect(blob.category).toBe("to_know");
  });

  it("always sets status to todo", () => {
    const blob = notableFactBlob(makeNotableFact());
    expect(blob.status).toBe("todo");
  });

  it("always sets doneAt to null", () => {
    const blob = notableFactBlob(makeNotableFact());
    expect(blob.doneAt).toBeNull();
  });

  it("preserves shortDescription", () => {
    const blob = notableFactBlob(
      makeNotableFact({ shortDescription: "Team is 12 people" })
    );
    expect(blob.text).toBe("Team is 12 people");
  });
});

// ── updateTodoIfChanged ───────────────────────────────────────────────────────

type TodoStub = {
  createdByType: ProjectTodoActorType;
  markedAsDoneByType: ProjectTodoActorType | null;
  text: string;
  status: ProjectTodoStatus;
  doneAt: Date | null;
  updateWithVersion: ReturnType<typeof vi.fn>;
};

function makeTodoStub(overrides: Partial<TodoStub> = {}): TodoStub {
  return {
    createdByType: "agent",
    markedAsDoneByType: null,
    text: "Write the report",
    status: "todo",
    doneAt: null,
    updateWithVersion: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeBlob(
  overrides: Partial<{
    category: ProjectTodoCategory;
    text: string;
    status: "todo" | "done";
    doneAt: Date | null;
  }> = {}
) {
  return {
    category: "to_do" as ProjectTodoCategory,
    text: "Write the report",
    status: "todo" as const,
    doneAt: null,
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
    });
  });
});
