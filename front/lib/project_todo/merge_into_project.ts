// This module merges the latest takeaway snapshots for all conversations in a
// project into project_todo rows. It is called by mergeTodosForProjectActivity,
// which itself is invoked by the per-project projectTodoWorkflow at most once
// per hour (based on the cron schedule).
//
// High-level algorithm (3 phases):
//
//   Phase 1 — Collect new candidates.
//     For every (takeaway, item, targetUser) triple:
//       - fetchBySourceId(itemId, userId):
//           found     → update text/status/doneAt if changed (no new row)
//           not found → push to newCandidates[]
//
//   Phase 2 — Semantic deduplication.
//     - Pre-fetch existing todos per (userId, category) for the space.
//     - Run one LLM call per non-empty (userId, category) group to detect
//       items that describe the same task despite different wording.
//     - Build dedupMap: `${userId}:${itemId}` → matching ProjectTodoResource.
//       Missing keys mean the candidate is genuinely new.
//
//   Phase 3 — Create or link.
//     For each candidate in newCandidates:
//       - Key in dedupMap → addSource on existing todo.
//           If existing todo is user-created: preserve text/status (user wins).
//           If existing todo is agent-created: also update if content changed.
//       - Not in dedupMap → makeNew + addSource (current behaviour).
//
// Category mapping:
//   actionItems  (open)    → "to_do",   status: "todo"
//   actionItems  (done)    → "to_do",   status: "done"
//   keyDecisions (open)    → "to_know", status: "todo"
//   keyDecisions (decided) → "to_know", status: "todo"
//   notableFacts           → "to_know", status: "todo"

import { getSmallWhitelistedModel } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  batchDeduplicateCandidates,
  type DeduplicateCandidate,
  type DeduplicatedGroup,
  type ExistingTodosByUser,
} from "@app/lib/project_todo/deduplicate_candidates";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import {
  TakeawaysResource,
  type TakeawaysWithSource,
} from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ProjectTodoSourceInfo } from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import type { Logger } from "pino";

// Stable identifier used when recording the creating actor for butler-created
// project todos. This is not an actual agent configuration sId but a sentinel
// for the internal merge workflow.
const BUTLER_AGENT_SID = "butler";

// ── Types ─────────────────────────────────────────────────────────────────────

type TodoBlob = {
  text: string;
  status: "todo" | "done";
  doneAt: Date | null;
  reasoningDoneAt: string | null;
};

// A candidate todo that has no existing source link yet and therefore needs to
// go through the deduplication check before being created or linked.
type PendingCandidate = {
  itemId: string;
  userId: ModelId;
  blob: TodoBlob;
  source: ProjectTodoSourceInfo;
};

// ── Stats ─────────────────────────────────────────────────────────────────────

export type MergeStats = {
  takeawaysProcessed: number;
  candidatesCollected: number;
  existingUpdated: number;
  deduplicated: number;
  createdNew: number;
};

function emptyMergeStats(): MergeStats {
  return {
    takeawaysProcessed: 0,
    candidatesCollected: 0,
    existingUpdated: 0,
    deduplicated: 0,
    createdNew: 0,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function mergeTakeawaysIntoProject({
  localLogger,
  workspaceId,
  spaceId,
}: {
  localLogger: Logger;
  workspaceId: string;
  spaceId: string;
}): Promise<MergeStats> {
  const stats = emptyMergeStats();

  const spaceModelId = getResourceIdFromSId(spaceId);
  if (spaceModelId === null) {
    localLogger.error("Project todo merge: invalid space sId");
    return stats;
  }

  const adminAuth = await Authenticator.internalAdminForWorkspace(workspaceId);

  // Fetch all latest takeaways for the space directly.
  const latestTakeawaysWithSource =
    await TakeawaysResource.fetchLatestBySpaceId(adminAuth, { spaceModelId });

  stats.takeawaysProcessed = latestTakeawaysWithSource.length;

  if (latestTakeawaysWithSource.length === 0) {
    localLogger.info("Project todo merge: no takeaways found, skipping");
    return stats;
  }

  // Collect all user sIds referenced across all takeaways so we can batch-fetch
  // the corresponding UserResources in a single query.
  const allUserIds = new Set<string>();
  for (const { takeaway } of latestTakeawaysWithSource) {
    for (const item of takeaway.actionItems) {
      if (item.assigneeUserId) {
        allUserIds.add(item.assigneeUserId);
      }
    }
  }

  const users =
    allUserIds.size > 0 ? await UserResource.fetchByIds([...allUserIds]) : [];
  const usersById = new Map<string, UserResource>(users.map((u) => [u.sId, u]));

  // ── Phase 1: collect new candidates, update already-linked items ──────────

  const { candidates: newCandidates, existingUpdated } =
    await collectNewCandidates(adminAuth, {
      latestTakeawaysWithSource,
      usersById,
    });

  stats.candidatesCollected = newCandidates.length;
  stats.existingUpdated = existingUpdated;

  if (newCandidates.length === 0) {
    localLogger.info("Project todo merge: no new candidates found, skipping");
    return stats;
  }

  // ── Phase 2: semantic deduplication ──────────────────────────────────────

  const dedupGroups = await buildDeduplicationGroups(adminAuth, {
    localLogger,
    newCandidates,
    spaceModelId,
  });

  // ── Phase 3: create or link ───────────────────────────────────────────────

  const { deduplicated, createdNew } = await createOrLinkTodos(adminAuth, {
    localLogger,
    newCandidates,
    dedupGroups,
    spaceModelId,
  });

  stats.deduplicated = deduplicated;
  stats.createdNew = createdNew;

  return stats;
}

// ── Phase 1 ───────────────────────────────────────────────────────────────────

// For each (takeaway, item, targetUser) triple: if a source link already exists,
// update the todo's content if it has changed. Otherwise, push the item to the
// returned candidates list for semantic dedup in phase 2.
async function collectNewCandidates(
  auth: Authenticator,
  {
    latestTakeawaysWithSource,
    usersById,
  }: {
    latestTakeawaysWithSource: TakeawaysWithSource[];
    usersById: Map<string, UserResource>;
  }
): Promise<{ candidates: PendingCandidate[]; existingUpdated: number }> {
  const newCandidates: PendingCandidate[] = [];
  let existingUpdated = 0;

  await concurrentExecutor(
    latestTakeawaysWithSource,
    async (takeawayWithSource) => {
      const result = await collectDocumentCandidates(auth, {
        takeawayWithSource,
        usersById,
      });
      newCandidates.push(...result.candidates);
      existingUpdated += result.existingUpdated;
    },
    { concurrency: 4 }
  );

  return { candidates: newCandidates, existingUpdated };
}

// Processes one document's takeaway: updates todos whose source link already
// exists and returns items that need to go through dedup + creation.
async function collectDocumentCandidates(
  auth: Authenticator,
  {
    takeawayWithSource,
    usersById,
  }: {
    takeawayWithSource: TakeawaysWithSource;
    usersById: Map<string, UserResource>;
  }
): Promise<{ candidates: PendingCandidate[]; existingUpdated: number }> {
  function resolveTargetUserIds(userSIds: string[]): ModelId[] {
    return userSIds
      .map((sId) => usersById.get(sId)?.id)
      .filter((id): id is ModelId => id !== undefined);
  }

  // Build all (itemId, targetUserIds, blob) triples up-front so we can
  // batch-fetch source links in a single pass below.
  const actionItems: Array<{
    itemId: string;
    targetUserIds: ModelId[];
    blob: TodoBlob;
  }> = takeawayWithSource.takeaway.actionItems.map((item) => ({
    itemId: item.sId,
    targetUserIds: resolveTargetUserIds(
      item.assigneeUserId ? [item.assigneeUserId] : []
    ),
    blob: actionItemBlob(item),
  }));

  // Batch-fetch existing todos by itemId. The result map is keyed by
  // `${itemId}:${userId}`, matching the lookup below so a hit means
  // "this (item, user) pair is already linked to a todo — skip dedup".
  const allActionItemIds = actionItems.map((t) => t.itemId);
  const existingByKey = await ProjectTodoResource.fetchByItemIds(auth, {
    itemIds: allActionItemIds,
  });

  const candidates: PendingCandidate[] = [];
  let existingUpdated = 0;
  for (const { itemId, targetUserIds, blob: actionItemBlob } of actionItems) {
    for (const userId of targetUserIds) {
      const existing = existingByKey.get(itemId)?.get(userId) ?? null;
      if (existing !== null) {
        // Source link exists — update content if it has changed.
        const updated = await updateTodoIfChanged(
          existing,
          auth,
          actionItemBlob
        );
        if (updated) {
          existingUpdated++;
        }
      } else {
        candidates.push({
          itemId,
          userId,
          blob: actionItemBlob,
          source: takeawayWithSource.source,
        });
      }
    }
  }

  return { candidates, existingUpdated };
}

// ── Phase 2 ───────────────────────────────────────────────────────────────────

// Pre-fetches all existing todos per (userId, category) and runs batch semantic
// deduplication via LLM. Returns one singleton "new" group per candidate if no
// model is available — Phase 3 then creates fresh todos for all of them.
async function buildDeduplicationGroups(
  auth: Authenticator,
  {
    localLogger,
    newCandidates,
    spaceModelId,
  }: {
    localLogger: Logger;
    newCandidates: PendingCandidate[];
    spaceModelId: ModelId;
  }
): Promise<DeduplicatedGroup[]> {
  const deduplicateCandidates: DeduplicateCandidate[] = newCandidates.map(
    (c) => ({
      itemId: c.itemId,
      userId: c.userId,
      text: c.blob.text,
    })
  );

  const model = getSmallWhitelistedModel(auth);
  if (!model) {
    localLogger.warn(
      "Project todo merge: no whitelisted model, skipping deduplication"
    );
    return deduplicateCandidates.map((c) => ({ kind: "new", candidates: [c] }));
  }

  // Fetch all existing todos for each unique target user in a single pass,
  // then nest them under userId → category → todos for lookup by the LLM
  // calls.
  const uniqueUserIds = [...new Set(newCandidates.map((c) => c.userId))];
  const existingTodosByUser: ExistingTodosByUser = new Map();

  await concurrentExecutor(
    uniqueUserIds,
    async (userId) => {
      const todos = await ProjectTodoResource.fetchLatestBySpaceForUser(auth, {
        spaceId: spaceModelId,
        userId,
      });
      for (const todo of todos) {
        const bucket = existingTodosByUser.get(todo.userId) ?? [];
        bucket.push(todo);
        existingTodosByUser.set(todo.userId, bucket);
      }
    },
    { concurrency: 4 }
  );

  return batchDeduplicateCandidates(auth, {
    model,
    candidates: deduplicateCandidates,
    existingTodosByUser,
  });
}

// ── Phase 3 ───────────────────────────────────────────────────────────────────

// Executes one dedup group per call, atomically: groups don't share state, so
// they run in parallel at concurrency 4.
async function createOrLinkTodos(
  auth: Authenticator,
  {
    localLogger,
    newCandidates,
    dedupGroups,
    spaceModelId,
  }: {
    localLogger: Logger;
    newCandidates: PendingCandidate[];
    dedupGroups: DeduplicatedGroup[];
    spaceModelId: ModelId;
  }
): Promise<{ deduplicated: number; createdNew: number }> {
  let deduplicated = 0;
  let createdNew = 0;

  // Dedup groups reference candidates by (userId, itemId); fetch the original
  // PendingCandidate (with blob + source) by that pair.
  const pendingByUserItem = new Map<ModelId, Map<string, PendingCandidate>>();
  for (const c of newCandidates) {
    const inner =
      pendingByUserItem.get(c.userId) ?? new Map<string, PendingCandidate>();
    inner.set(c.itemId, c);
    pendingByUserItem.set(c.userId, inner);
  }

  function lookupPending(c: DeduplicateCandidate): PendingCandidate | null {
    return pendingByUserItem.get(c.userId)?.get(c.itemId) ?? null;
  }

  await concurrentExecutor(
    dedupGroups,
    async (group) => {
      if (group.kind === "existing") {
        // Attach every candidate's source to the existing todo. The update
        // guard lives in updateTodoIfChanged — no-op when the target todo was
        // created by a user or already marked done by one.
        const primary = lookupPending(group.candidates[0]);
        if (primary) {
          await updateTodoIfChanged(group.todo, auth, primary.blob);
        }
        for (const candidate of group.candidates) {
          const pending = lookupPending(candidate);
          if (!pending) {
            continue;
          }
          await group.todo.upsertSource(auth, {
            itemId: pending.itemId,
            source: pending.source,
          });
          deduplicated++;

          localLogger.info(
            {
              existingTodoId: group.todo.sId,
              itemId: pending.itemId,
              userId: pending.userId,
              source: pending.source,
              createdByType: group.todo.createdByType,
            },
            "Project todo merge: linked source to existing todo (semantic duplicate)"
          );
        }
        return;
      }

      // kind === "new": create one todo from the first candidate, attach every
      // other candidate's source to it.
      const primary = lookupPending(group.candidates[0]);
      if (!primary) {
        return;
      }

      const todo = await ProjectTodoResource.makeNewWithSource(auth, {
        blob: {
          spaceId: spaceModelId,
          userId: primary.userId,
          createdByType: "agent",
          createdByUserId: null,
          createdByAgentConfigurationId: BUTLER_AGENT_SID,
          text: primary.blob.text,
          status: primary.blob.status,
          doneAt: primary.blob.doneAt,
        },
        itemId: primary.itemId,
        source: primary.source,
      });
      createdNew++;

      localLogger.info(
        {
          todoId: todo.sId,
          itemId: primary.itemId,
          userId: primary.userId,
          source: primary.source,
        },
        "Project todo merge: created new todo"
      );

      for (let i = 1; i < group.candidates.length; i++) {
        const pending = lookupPending(group.candidates[i]);
        if (!pending) {
          continue;
        }
        await todo.upsertSource(auth, {
          itemId: pending.itemId,
          source: pending.source,
        });
        deduplicated++;

        localLogger.info(
          {
            todoId: todo.sId,
            itemId: pending.itemId,
            userId: pending.userId,
            source: pending.source,
          },
          "Project todo merge: linked source to new todo (intra-batch duplicate)"
        );
      }
    },
    { concurrency: 4 }
  );

  return { deduplicated, createdNew };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Creates a new version of a todo only when text, status, or doneAt has
// changed, AND the todo's state is not user-owned. Returns true if an update
// was performed.
//
// The agent path must never overwrite user-owned state:
//   - If the todo was created by a user, the user's phrasing and status win.
//   - If an agent-created todo was then marked done by a user, the user's
//     completion sticks — even if the next extraction still reports the item
//     as open.
export async function updateTodoIfChanged(
  todo: ProjectTodoResource,
  auth: Authenticator,
  blob: TodoBlob
): Promise<boolean> {
  if (todo.createdByType !== "agent") {
    return false;
  }
  if (todo.markedAsDoneByType === "user") {
    return false;
  }

  const textChanged = todo.text !== blob.text;
  const statusChanged = todo.status !== blob.status;
  const doneAtChanged =
    todo.doneAt?.toISOString() !== blob.doneAt?.toISOString();
  const actorRationaleAtChanged = todo.actorRationale !== blob.reasoningDoneAt;

  if (
    textChanged ||
    statusChanged ||
    doneAtChanged ||
    actorRationaleAtChanged
  ) {
    await todo.updateWithVersion(auth, {
      text: blob.text,
      status: blob.status,
      doneAt: blob.doneAt,
      actorRationale: blob.reasoningDoneAt,
    });
    return true;
  }
  return false;
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

export function actionItemBlob(item: TodoVersionedActionItem): TodoBlob {
  const isDone = item.status === "done";
  return {
    text: item.shortDescription,
    status: isDone ? "done" : "todo",
    doneAt:
      isDone && item.detectedDoneAt ? new Date(item.detectedDoneAt) : null,
    reasoningDoneAt:
      isDone && item.detectedDoneRationale ? item.detectedDoneRationale : null,
  };
}
