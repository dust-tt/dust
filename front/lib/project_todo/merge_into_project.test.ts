import type { Authenticator } from "@app/lib/auth";
import {
  actionItemBlob,
  updateTodoIfChanged,
} from "@app/lib/project_todo/merge_into_project";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type {
  ProjectTodoActorType,
  ProjectTodoStatus,
} from "@app/types/project_todo";
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
    detectedCreationRationale: null,
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
    reasoningCreatedAt: string | null;
  }> = {}
) {
  return {
    text: "Write the report",
    status: "todo" as const,
    doneAt: null,
    reasoningDoneAt: null,
    reasoningCreatedAt: null,
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

  it("ignores text changes on an agent-created todo (first version wins)", async () => {
    const todo = makeTodoStub({ text: "Old text" });
    const blob = makeBlob({ text: "New text" });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(false);
    expect(todo.updateWithVersion).not.toHaveBeenCalled();
  });

  it("preserves the original text when status changes on an agent-created todo", async () => {
    const doneAt = new Date("2026-04-21T12:00:00.000Z");
    const todo = makeTodoStub({ text: "Old text", status: "todo" });
    const blob = makeBlob({
      text: "New text",
      status: "done",
      doneAt,
    });

    const updated = await updateTodoIfChanged(
      todo as unknown as ProjectTodoResource,
      fakeAuth,
      blob
    );

    expect(updated).toBe(true);
    expect(todo.updateWithVersion).toHaveBeenCalledWith(fakeAuth, {
      text: "Old text",
      status: "done",
      doneAt,
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

  it("returns false when the system tries to reopen a done todo (regardless of who marked it done)", async () => {
    // The system must never flip a completed todo back to open — only a user
    // can reopen a todo. This aplies even when the todo was marked done by an
    // agent (not a user).
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

    expect(updated).toBe(false);
    expect(todo.updateWithVersion).not.toHaveBeenCalled();
  });
});
