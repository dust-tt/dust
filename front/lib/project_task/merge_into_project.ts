// This module merges the latest takeaway snapshots for all conversations in a
// project into project_todo rows. It is called by mergeTasksForProjectActivity,
// which itself is invoked by the per-project durable projectTodoWorkflow (serialized runs)
// per hour (based on the cron schedule).
//
// High-level algorithm (3 phases):
//
//   Phase 1 — Collect new candidates.
//     For every (takeaway, item, targetUser) triple:
//       - fetchByItemId(itemId):
//           found     → skip (the item is already linked to a todo; the
//                       takeaway no longer carries any status that could
//                       update it)
//           not found → push to newCandidates[]
//
//   Phase 2 — Semantic deduplication.
//     - Pre-fetch existing todos per (userId, category) for the space.
//     - Run one LLM call per non-empty (userId, category) group to detect
//       items that describe the same task despite different wording.
//     - Build dedupMap: `${userId}:${itemId}` → matching ProjectTaskResource.
//       Missing keys mean the candidate is genuinely new.
//
//   Phase 3 — Create or link.
//     For each candidate in newCandidates:
//       - Key in dedupMap → upsertSource on existing todo.
//       - Not in dedupMap → makeNew + addSource.

import { getSmallWhitelistedModel } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  batchDeduplicateCandidates,
  type DeduplicateCandidate,
  type DeduplicatedGroup,
  type ExistingTodosByUser,
} from "@app/lib/project_task/deduplicate_candidates";
import {
  ProjectTaskResource,
  type TodosByItemId,
} from "@app/lib/resources/project_task_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import {
  TakeawaysResource,
  type TakeawaysWithSource,
} from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ProjectTaskSourceInfo } from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import type { Logger } from "pino";

// Stable identifier used when recording the creating actor for butler-created
// project todos. This is not an actual agent configuration sId but a sentinel
// for the internal merge workflow.
const BUTLER_AGENT_SID = "butler";

// ── Types ─────────────────────────────────────────────────────────────────────

// Outer key: userId (ModelId), inner key: itemId (action item sId).
type PendingByUserId = Map<ModelId, Map<string, PendingCandidate>>;

type TodoBlob = {
  text: string;
  reasoningCreatedAt: string | null;
};

// A candidate todo that has no existing source link yet and therefore needs to
// go through the deduplication check before being created or linked.
export type PendingCandidate = {
  itemId: string;
  userId: ModelId;
  blob: TodoBlob;
  source: ProjectTaskSourceInfo;
};

// ── Stats ─────────────────────────────────────────────────────────────────────

export type MergeStats = {
  takeawaysProcessed: number;
  candidatesCollected: number;
  deduplicated: number;
  createdNew: number;
};

function emptyMergeStats(): MergeStats {
  return {
    takeawaysProcessed: 0,
    candidatesCollected: 0,
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

  // ── Phase 1: collect new candidates ──────────────────────────────────────

  const newCandidates = await collectNewCandidates(adminAuth, {
    latestTakeawaysWithSource,
    usersById,
  });

  stats.candidatesCollected = newCandidates.length;

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

// For each (takeaway, item, targetUser) triple: skip if a source link already
// exists, otherwise push the item to the returned candidates list for semantic
// dedup in phase 2.
async function collectNewCandidates(
  auth: Authenticator,
  {
    latestTakeawaysWithSource,
    usersById,
  }: {
    latestTakeawaysWithSource: TakeawaysWithSource[];
    usersById: Map<string, UserResource>;
  }
): Promise<PendingCandidate[]> {
  const newCandidates: PendingCandidate[] = [];

  await concurrentExecutor(
    latestTakeawaysWithSource,
    async (takeawayWithSource) => {
      const candidates = await collectDocumentCandidates(auth, {
        takeawayWithSource,
        usersById,
      });
      newCandidates.push(...candidates);
    },
    { concurrency: 4 }
  );

  return newCandidates;
}

// Processes one document's takeaway: returns items that have no existing
// source link and need to go through dedup + creation. Items already linked
// to a todo are skipped — the takeaway no longer carries any state that
// could update them.
export async function collectDocumentCandidates(
  auth: Authenticator,
  {
    takeawayWithSource,
    usersById,
  }: {
    takeawayWithSource: TakeawaysWithSource;
    usersById: Map<string, UserResource>;
  }
): Promise<PendingCandidate[]> {
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

  // Batch-fetch existing todos by itemId. A hit means "this item is already
  // linked to a todo — skip".
  const allActionItemIds = actionItems.map((t) => t.itemId);
  const existingByItemId: TodosByItemId =
    await ProjectTaskResource.fetchByItemIds(auth, {
      itemIds: allActionItemIds,
    });

  const candidates: PendingCandidate[] = [];
  for (const { itemId, targetUserIds, blob } of actionItems) {
    for (const userId of targetUserIds) {
      const existing = existingByItemId.get(itemId)?.get(userId) ?? [];
      if (existing.length === 0) {
        candidates.push({
          itemId,
          userId,
          blob,
          source: takeawayWithSource.source,
        });
      }
    }
  }

  return candidates;
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
  const dedupInput: DeduplicateCandidate[] = newCandidates.map((c) => ({
    itemId: c.itemId,
    userId: c.userId,
    text: c.blob.text,
  }));

  const model = getSmallWhitelistedModel(auth);
  if (!model) {
    localLogger.warn(
      "Project todo merge: no whitelisted model, skipping deduplication"
    );
    return dedupInput.map((c) => ({ kind: "new", candidates: [c] }));
  }

  // Fetch all existing todos for each unique target user in a single pass,
  // then nest them under userId → category → todos for lookup by the LLM
  // calls.
  const uniqueUserIds = [...new Set(newCandidates.map((c) => c.userId))];
  const existingTodosByUser: ExistingTodosByUser = new Map();

  await concurrentExecutor(
    uniqueUserIds,
    async (userId) => {
      // we want deleted TODOs to match them
      const todos =
        await ProjectTaskResource.fetchLatestBySpaceForUserIncludingDeleted(
          auth,
          { spaceId: spaceModelId, userId }
        );
      for (const todo of todos) {
        if (todo.userId === null) {
          continue;
        }
        const bucket = existingTodosByUser.get(todo.userId) ?? [];
        bucket.push(todo);
        existingTodosByUser.set(todo.userId, bucket);
      }
    },
    { concurrency: 4 }
  );

  return batchDeduplicateCandidates(auth, {
    model,
    candidates: dedupInput,
    existingTodosByUser,
  });
}

// ── Phase 3 ───────────────────────────────────────────────────────────────────

// Executes one dedup group per call, atomically: groups don't share state, so
// they run in parallel at concurrency 4.
export async function createOrLinkTodos(
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
  const pendingByUserId: PendingByUserId = new Map();
  for (const c of newCandidates) {
    const inner =
      pendingByUserId.get(c.userId) ?? new Map<string, PendingCandidate>();
    inner.set(c.itemId, c);
    pendingByUserId.set(c.userId, inner);
  }

  function lookupPending(c: DeduplicateCandidate): PendingCandidate | null {
    return pendingByUserId.get(c.userId)?.get(c.itemId) ?? null;
  }

  await concurrentExecutor(
    dedupGroups,
    async (group) => {
      if (group.kind === "existing") {
        if (group.todo.deletedAt !== null) {
          // Candidate matched a deleted todo — do not re-create or re-link.
          return;
        }
        // Attach every candidate's source to the existing todo.
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

      const todo = await ProjectTaskResource.makeNewWithSource(auth, {
        blob: {
          spaceId: spaceModelId,
          userId: primary.userId,
          createdByType: "agent",
          createdByUserId: null,
          createdByAgentConfigurationId: BUTLER_AGENT_SID,
          agentSuggestionStatus: "pending",
          text: primary.blob.text,
          status: "todo",
          doneAt: null,
          actorRationale: primary.blob.reasoningCreatedAt,
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

// ── Blob helpers ─────────────────────────────────────────────────────────────

export function actionItemBlob(item: TodoVersionedActionItem): TodoBlob {
  return {
    text: item.shortDescription,
    reasoningCreatedAt: item.detectedCreationRationale,
  };
}
