import type { Authenticator } from "@app/lib/auth";
import type { DeduplicatedGroup } from "@app/lib/project_todo/deduplicate_candidates";
import {
  actionItemBlob,
  collectDocumentCandidates,
  createOrLinkTodos,
  updateTodoIfChanged,
} from "@app/lib/project_todo/merge_into_project";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { TakeawaysWithSource } from "@app/lib/resources/takeaways_resource";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type {
  ProjectTodoActorType,
  ProjectTodoSourceInfo,
  ProjectTodoStatus,
} from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared fixtures ───────────────────────────────────────────────────────────

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

function makeSource(
  overrides: Partial<ProjectTodoSourceInfo> = {}
): ProjectTodoSourceInfo {
  return {
    sourceType: "slack",
    sourceId: "conv-test-1",
    sourceTitle: "Test Conversation",
    sourceUrl: null,
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

// ── collectDocumentCandidates ─────────────────────────────────────────────────

describe("collectDocumentCandidates", () => {
  let auth: Authenticator;
  let user: UserResource;
  let usersById: Map<string, UserResource>;
  let takeawayBase: TakeawaysResource;
  let source: ProjectTodoSourceInfo;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "user" });
    auth = setup.authenticator;
    user = setup.user;
    usersById = new Map([[user.sId, user]]);
    source = makeSource();
    takeawayBase = await TakeawaysResource.makeNew(auth, {
      spaceId: setup.globalSpace.id,
      actionItems: [],
    });
  });

  function makeTakeawayWithSource(
    actionItems: TodoVersionedActionItem[]
  ): TakeawaysWithSource {
    // Reuse takeawayBase with a fresh actionItems list by spreading into a
    // plain wrapper. collectDocumentCandidates reads `.takeaway.actionItems`
    // and `.source`, nothing else.
    return {
      takeaway: Object.assign(Object.create(takeawayBase), {
        actionItems,
      }) as TakeawaysResource,
      source,
    };
  }

  it("returns the action item as a new candidate when no existing todo is linked", async () => {
    const tws = makeTakeawayWithSource([
      makeActionItem({
        sId: "item-new",
        assigneeUserId: user.sId,
        status: "open",
      }),
    ]);

    const { candidates, existingUpdated } = await collectDocumentCandidates(
      auth,
      { takeawayWithSource: tws, usersById }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].itemId).toBe("item-new");
    expect(existingUpdated).toBe(0);
  });

  it("updates the existing agent-created todo and returns no candidate when status changed", async () => {
    const todo = await ProjectTodoResource.makeNew(auth, {
      spaceId: takeawayBase.spaceId,
      userId: user.id,
      createdByType: "agent",
      createdByUserId: null,
      createdByAgentConfigurationId: "butler",
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
      text: "Write the report",
      status: "todo",
      doneAt: null,
      actorRationale: null,
      agentInstructions: null,
    });
    await todo.upsertSource(auth, { itemId: "item-existing", source });

    const tws = makeTakeawayWithSource([
      makeActionItem({
        sId: "item-existing",
        assigneeUserId: user.sId,
        status: "done",
        detectedDoneAt: "2026-05-01T10:00:00.000Z",
      }),
    ]);

    const { candidates, existingUpdated } = await collectDocumentCandidates(
      auth,
      { takeawayWithSource: tws, usersById }
    );

    expect(candidates).toHaveLength(0);
    expect(existingUpdated).toBe(1);
    const refreshed = await ProjectTodoResource.fetchBySId(auth, todo.sId);
    expect(refreshed?.status).toBe("done");
  });

  it("skips entirely when multiple existing todos are present and any is done", async () => {
    const spaceId = takeawayBase.spaceId;
    const agentBlob = {
      spaceId,
      userId: user.id,
      createdByType: "agent" as const,
      createdByUserId: null,
      createdByAgentConfigurationId: "butler",
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
      text: "Multi item",
      status: "todo" as const,
      doneAt: null,
      actorRationale: null,
      agentInstructions: null,
    };

    const doneTodo = await ProjectTodoResource.makeNew(auth, {
      ...agentBlob,
      status: "done",
      doneAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    await doneTodo.upsertSource(auth, {
      itemId: "item-multi-done",
      source: { ...source, sourceId: "src-done" },
    });

    const openTodo = await ProjectTodoResource.makeNew(auth, agentBlob);
    await openTodo.upsertSource(auth, {
      itemId: "item-multi-done",
      source: { ...source, sourceId: "src-open" },
    });

    const tws = makeTakeawayWithSource([
      makeActionItem({
        sId: "item-multi-done",
        assigneeUserId: user.sId,
        status: "done",
        detectedDoneAt: "2026-05-01T00:00:00.000Z",
      }),
    ]);

    const { candidates, existingUpdated } = await collectDocumentCandidates(
      auth,
      { takeawayWithSource: tws, usersById }
    );

    expect(candidates).toHaveLength(0);
    expect(existingUpdated).toBe(0);
  });

  it("updates only the most recently created todo when multiple exist and none is done", async () => {
    const spaceId = takeawayBase.spaceId;
    const agentBlob = {
      spaceId,
      userId: user.id,
      createdByType: "agent" as const,
      createdByUserId: null,
      createdByAgentConfigurationId: "butler",
      markedAsDoneByType: null,
      markedAsDoneByUserId: null,
      markedAsDoneByAgentConfigurationId: null,
      text: "Multi open item",
      status: "todo" as const,
      doneAt: null,
      actorRationale: null,
      agentInstructions: null,
    };

    const olderTodo = await ProjectTodoResource.makeNew(auth, agentBlob);
    await olderTodo.upsertSource(auth, {
      itemId: "item-multi-open",
      source: { ...source, sourceId: "src-older" },
    });

    const newerTodo = await ProjectTodoResource.makeNew(auth, agentBlob);
    await newerTodo.upsertSource(auth, {
      itemId: "item-multi-open",
      source: { ...source, sourceId: "src-newer" },
    });

    const tws = makeTakeawayWithSource([
      makeActionItem({
        sId: "item-multi-open",
        assigneeUserId: user.sId,
        status: "done",
        detectedDoneAt: "2026-05-01T00:00:00.000Z",
      }),
    ]);

    const { candidates, existingUpdated } = await collectDocumentCandidates(
      auth,
      { takeawayWithSource: tws, usersById }
    );

    expect(candidates).toHaveLength(0);
    expect(existingUpdated).toBe(1);

    const olderRefreshed = await ProjectTodoResource.fetchBySId(
      auth,
      olderTodo.sId
    );
    const newerRefreshed = await ProjectTodoResource.fetchBySId(
      auth,
      newerTodo.sId
    );
    // The newer todo (higher createdAt) should have been updated to done.
    expect(newerRefreshed?.status).toBe("done");
    expect(olderRefreshed?.status).toBe("todo");
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

// ── createOrLinkTodos ─────────────────────────────────────────────────────────

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe("createOrLinkTodos", () => {
  it("skips candidates when the matched existing todo is soft-deleted", async () => {
    const upsertSource = vi.fn();
    const deletedTodo = {
      deletedAt: new Date("2026-04-01T00:00:00.000Z"),
      sId: "todo-deleted",
      upsertSource,
    } as unknown as ProjectTodoResource;

    const group: DeduplicatedGroup = {
      kind: "existing",
      todo: deletedTodo,
      candidates: [
        { itemId: "item-x", userId: 1 as ModelId, text: "Do the thing" },
      ],
    };

    const { deduplicated, createdNew } = await createOrLinkTodos(fakeAuth, {
      localLogger: fakeLogger,
      newCandidates: [
        {
          itemId: "item-x",
          userId: 1 as ModelId,
          blob: {
            text: "Do the thing",
            status: "todo",
            doneAt: null,
            reasoningDoneAt: null,
            reasoningCreatedAt: null,
          },
          source: makeSource(),
        },
      ],
      dedupGroups: [group],
      spaceModelId: 1 as ModelId,
    });

    expect(upsertSource).not.toHaveBeenCalled();
    expect(deduplicated).toBe(0);
    expect(createdNew).toBe(0);
  });

  it("links source when the matched existing todo is not deleted", async () => {
    const upsertSource = vi.fn().mockResolvedValue(undefined);
    const updateWithVersion = vi.fn().mockResolvedValue(undefined);
    const liveTodo = {
      deletedAt: null,
      sId: "todo-live",
      status: "todo",
      createdByType: "agent",
      markedAsDoneByType: null,
      text: "Do the thing",
      doneAt: null,
      actorRationale: null,
      userId: 1 as ModelId,
      upsertSource,
      updateWithVersion,
    } as unknown as ProjectTodoResource;

    const group: DeduplicatedGroup = {
      kind: "existing",
      todo: liveTodo,
      candidates: [
        { itemId: "item-y", userId: 1 as ModelId, text: "Do the thing" },
      ],
    };

    const { deduplicated, createdNew } = await createOrLinkTodos(fakeAuth, {
      localLogger: fakeLogger,
      newCandidates: [
        {
          itemId: "item-y",
          userId: 1 as ModelId,
          blob: {
            text: "Do the thing",
            status: "todo",
            doneAt: null,
            reasoningDoneAt: null,
            reasoningCreatedAt: null,
          },
          source: makeSource(),
        },
      ],
      dedupGroups: [group],
      spaceModelId: 1 as ModelId,
    });

    expect(upsertSource).toHaveBeenCalledOnce();
    expect(deduplicated).toBe(1);
    expect(createdNew).toBe(0);
  });
});
