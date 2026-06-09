import type { Authenticator } from "@app/lib/auth";
import type { DeduplicatedGroup } from "@app/lib/project_task/deduplicate_candidates";
import {
  actionItemBlob,
  collectDocumentCandidates,
  createOrLinkTasks,
} from "@app/lib/project_task/merge_into_project";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { TakeawaysWithSource } from "@app/lib/resources/takeaways_resource";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { PodTaskSourceInfo } from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import type { TaskVersionedActionItem } from "@app/types/takeaways";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeActionItem(
  overrides: Partial<TaskVersionedActionItem> = {}
): TaskVersionedActionItem {
  return {
    sId: "action-1",
    shortDescription: "Write the report",
    assigneeUserId: null,
    assigneeName: null,
    detectedCreationRationale: null,
    ...overrides,
  };
}

function makeSource(
  overrides: Partial<PodTaskSourceInfo> = {}
): PodTaskSourceInfo {
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
  it("preserves shortDescription as text", () => {
    const blob = actionItemBlob(
      makeActionItem({ shortDescription: "Deploy to prod" })
    );
    expect(blob.text).toBe("Deploy to prod");
  });

  it("forwards detectedCreationRationale as reasoningCreatedAt", () => {
    const blob = actionItemBlob(
      makeActionItem({ detectedCreationRationale: "Alice committed to it" })
    );
    expect(blob.reasoningCreatedAt).toBe("Alice committed to it");
  });
});

// ── collectDocumentCandidates ─────────────────────────────────────────────────

describe("collectDocumentCandidates", () => {
  let auth: Authenticator;
  let user: UserResource;
  let usersById: Map<string, UserResource>;
  let takeawayBase: TakeawaysResource;
  let source: PodTaskSourceInfo;

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
    actionItems: TaskVersionedActionItem[]
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

  it("returns the action item as a new candidate when no existing task is linked", async () => {
    const tws = makeTakeawayWithSource([
      makeActionItem({
        sId: "item-new",
        assigneeUserId: user.sId,
      }),
    ]);

    const candidates = await collectDocumentCandidates(auth, {
      takeawayWithSource: tws,
      usersById,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].itemId).toBe("item-new");
  });

  it("updates the existing agent-created task and returns no candidate when status changed", async () => {
    const task = await ProjectTaskResource.makeNew(auth, {
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
    await task.upsertSource(auth, { itemId: "item-existing", source });

    const tws = makeTakeawayWithSource([
      makeActionItem({
        sId: "item-existing",
        assigneeUserId: user.sId,
      }),
    ]);

    const candidates = await collectDocumentCandidates(auth, {
      takeawayWithSource: tws,
      usersById,
    });

    expect(candidates).toHaveLength(0);
    const refreshed = await ProjectTaskResource.fetchBySId(auth, task.sId);
    expect(refreshed?.status).toBe("todo");
  });
});

const fakeAuth = {} as Authenticator;

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe("createOrLinkTasks", () => {
  it("skips candidates when the matched existing task is soft-deleted", async () => {
    const upsertSource = vi.fn();
    const deletedTask = {
      deletedAt: new Date("2026-04-01T00:00:00.000Z"),
      sId: "task-deleted",
      upsertSource,
    } as unknown as ProjectTaskResource;

    const group: DeduplicatedGroup = {
      kind: "existing",
      task: deletedTask,
      candidates: [
        { itemId: "item-x", userId: 1 as ModelId, text: "Do the thing" },
      ],
    };

    const result = await createOrLinkTasks(fakeAuth, {
      localLogger: fakeLogger,
      newCandidates: [
        {
          itemId: "item-x",
          userId: 1 as ModelId,
          blob: {
            text: "Do the thing",
            reasoningCreatedAt: null,
          },
          source: makeSource(),
        },
      ],
      unassignedCandidates: [],
      dedupGroups: [group],
      spaceModelId: 1 as ModelId,
      memberCount: 10,
    });

    expect(result.isOk()).toBe(true);
    const { deduplicated, createdNew } = result.isOk()
      ? result.value
      : { deduplicated: -1, createdNew: -1 };
    expect(upsertSource).not.toHaveBeenCalled();
    expect(deduplicated).toBe(0);
    expect(createdNew).toBe(0);
  });

  it("links source when the matched existing task is not deleted", async () => {
    const upsertSource = vi.fn().mockResolvedValue(undefined);
    const liveTask = {
      deletedAt: null,
      sId: "task-live",
      status: "todo",
      createdByType: "agent",
      markedAsDoneByType: null,
      text: "Do the thing",
      doneAt: null,
      actorRationale: null,
      userId: 1 as ModelId,
      upsertSource,
    } as unknown as ProjectTaskResource;

    const group: DeduplicatedGroup = {
      kind: "existing",
      task: liveTask,
      candidates: [
        { itemId: "item-y", userId: 1 as ModelId, text: "Do the thing" },
      ],
    };

    const result = await createOrLinkTasks(fakeAuth, {
      localLogger: fakeLogger,
      newCandidates: [
        {
          itemId: "item-y",
          userId: 1 as ModelId,
          blob: {
            text: "Do the thing",
            reasoningCreatedAt: null,
          },
          source: makeSource(),
        },
      ],
      unassignedCandidates: [],
      dedupGroups: [group],
      spaceModelId: 1 as ModelId,
      memberCount: 10,
    });

    expect(result.isOk()).toBe(true);
    const { deduplicated, createdNew } = result.isOk()
      ? result.value
      : { deduplicated: -1, createdNew: -1 };
    expect(upsertSource).toHaveBeenCalledOnce();
    expect(deduplicated).toBe(1);
    expect(createdNew).toBe(0);
  });
});
