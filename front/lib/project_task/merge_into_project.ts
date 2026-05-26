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
//     - Pre-fetch all existing tasks for the space (all users, including deleted).
//     - Run ONE LLM call with all candidates and all existing tasks to detect
//       items that describe the same task despite different wording.
//     - Build dedupMap: `${userId}:${itemId}` → matching ProjectTaskResource.
//       Missing keys mean the candidate is genuinely new.
//
//   Phase 3 — Create or link.
//     For each candidate in newCandidates:
//       - Key in dedupMap → upsertSource on existing task.
//       - Not in dedupMap → makeNew + addSource.

import { getSmallWhitelistedModel } from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import {
  batchDeduplicateCandidates,
  type DeduplicateCandidate,
  type DeduplicatedGroup,
} from "@app/lib/project_task/deduplicate_candidates";
import {
  ProjectTaskResource,
  type TasksByItemId,
} from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import {
  TakeawaysResource,
  type TakeawaysWithSource,
} from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ProjectTaskSourceInfo } from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import type { TaskVersionedActionItem } from "@app/types/takeaways";
import type { Logger } from "pino";

// Stable identifier used when recording the creating actor for butler-created
// project tasks. This is not an actual agent configuration sId but a sentinel
// for the internal merge workflow.
const BUTLER_AGENT_SID = "butler";

// ── Types ─────────────────────────────────────────────────────────────────────

// Outer key: userId (ModelId | null), inner key: itemId (action item sId).
type PendingByUserId = Map<ModelId | null, Map<string, PendingCandidate>>;

type TaskBlob = {
  text: string;
  reasoningCreatedAt: string | null;
};

// A candidate task that has no existing source link yet and therefore needs to
// go through the deduplication check before being created or linked.
// userId is null for unassigned action items.
export type PendingCandidate = {
  itemId: string;
  userId: ModelId | null;
  blob: TaskBlob;
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
  runId,
  space,
  adminAuth,
}: {
  localLogger: Logger;
  runId: string;
  space: SpaceResource;
  adminAuth: Authenticator;
}): Promise<MergeStats> {
  const stats = emptyMergeStats();

  // Fetch all latest takeaways for the space directly.
  const latestTakeawaysWithSource =
    await TakeawaysResource.fetchLatestBySpaceId(adminAuth, {
      spaceModelId: space.id,
    });

  stats.takeawaysProcessed = latestTakeawaysWithSource.length;

  if (latestTakeawaysWithSource.length === 0) {
    localLogger.info("Project task merge: no takeaways found, skipping");
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
    localLogger.info("Project task merge: no new candidates found, skipping");
    return stats;
  }

  // Separate unassigned candidates — they bypass dedup (no userId to group by).
  const unassignedCandidates = newCandidates.filter((c) => c.userId === null);
  const assignedCandidates = newCandidates.filter((c) => c.userId !== null);

  // ── Phase 2: semantic deduplication (assigned only) ───────────────────────

  const dedupGroups = await buildDeduplicationGroups(adminAuth, {
    localLogger,
    runId,
    newCandidates: assignedCandidates,
    spaceModelId: space.id,
  });

  // ── Phase 3: create or link ───────────────────────────────────────────────
  const members = await space.fetchDistinctActiveManualGroupMembers(adminAuth);
  const createResult = await createOrLinkTasks(adminAuth, {
    localLogger,
    newCandidates: assignedCandidates,
    unassignedCandidates,
    dedupGroups,
    spaceModelId: space.id,
    memberCount: members.length,
  });

  if (createResult.isErr()) {
    localLogger.error(
      { error: createResult.error.message },
      "Project task merge: too many new tasks, aborting"
    );
    return stats;
  }

  stats.deduplicated = createResult.value.deduplicated;
  stats.createdNew = createResult.value.createdNew;

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

// Processes one document's takeaway: updates tasks whose source link already
// exists and returns items that need to go through dedup + creation.
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
    blob: TaskBlob;
  }> = takeawayWithSource.takeaway.actionItems.map((item) => ({
    itemId: item.sId,
    targetUserIds: resolveTargetUserIds(
      item.assigneeUserId ? [item.assigneeUserId] : []
    ),
    blob: actionItemBlob(item),
  }));

  // Batch-fetch existing tasks by itemId. A hit means "this item is already
  // linked to a task — update if status changed, skip dedup".
  const allActionItemIds = actionItems.map((t) => t.itemId);
  const existingByItemId: TasksByItemId =
    await ProjectTaskResource.fetchByItemIds(auth, {
      itemIds: allActionItemIds,
    });

  const candidates: PendingCandidate[] = [];
  for (const { itemId, targetUserIds, blob } of actionItems) {
    if (targetUserIds.length > 0) {
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
    } else {
      // Unassigned item: create a candidate with null userId if no task is
      // already linked for this itemId (any userId).
      const existingForItem = existingByItemId.get(itemId);
      const alreadyLinked =
        existingForItem !== undefined && existingForItem.size > 0;
      if (!alreadyLinked) {
        candidates.push({
          itemId,
          userId: null,
          blob,
          source: takeawayWithSource.source,
        });
      }
    }
  }

  return candidates;
}

// ── Phase 2 ───────────────────────────────────────────────────────────────────

// Pre-fetches all existing tasks for the space and runs semantic deduplication
// via a single LLM call across all users. Returns one singleton "new" group per
// candidate if no model is available — Phase 3 then creates fresh tasks for all.
async function buildDeduplicationGroups(
  auth: Authenticator,
  {
    localLogger,
    runId,
    newCandidates,
    spaceModelId,
  }: {
    localLogger: Logger;
    runId: string;
    newCandidates: PendingCandidate[];
    spaceModelId: ModelId;
  }
): Promise<DeduplicatedGroup[]> {
  const dedupInput: DeduplicateCandidate[] = newCandidates.map((c) => ({
    itemId: c.itemId,
    userId: c.userId as ModelId,
    text: c.blob.text,
  }));

  const model = getSmallWhitelistedModel(auth);
  if (!model) {
    localLogger.warn(
      "Project task merge: no whitelisted model, skipping deduplication"
    );
    return dedupInput.map((c) => ({ kind: "new", candidates: [c] }));
  }

  // Fetch all existing tasks for the space in one pass (including deleted).
  // All tasks across all users are passed to a single LLM call.
  const existingTasks =
    await ProjectTaskResource.fetchAllBySpaceIncludingDeleted(auth, {
      spaceId: spaceModelId,
    });

  return batchDeduplicateCandidates(auth, {
    localLogger,
    runId,
    model,
    candidates: dedupInput,
    existingTasks,
  });
}

// ── Phase 3 ───────────────────────────────────────────────────────────────────

// Executes one dedup group per call, atomically: groups don't share state, so
// they run in parallel at concurrency 4.
export async function createOrLinkTasks(
  auth: Authenticator,
  {
    localLogger,
    newCandidates,
    unassignedCandidates,
    dedupGroups,
    spaceModelId,
    memberCount,
  }: {
    localLogger: Logger;
    newCandidates: PendingCandidate[];
    unassignedCandidates: PendingCandidate[];
    dedupGroups: DeduplicatedGroup[];
    spaceModelId: ModelId;
    memberCount: number;
  }
): Promise<Result<{ deduplicated: number; createdNew: number }, Error>> {
  // to get a number that grows with the number of members, but asymptotically to not have too many
  const maxNewTasks = Math.log(memberCount + 1) * 3;
  const newTaskCount =
    dedupGroups.filter((g) => g.kind === "new").length +
    unassignedCandidates.length;

  if (newTaskCount > maxNewTasks) {
    return new Err(
      new Error(
        `Too many new tasks: ${newTaskCount} candidates exceed the limit of ${maxNewTasks.toFixed(2)} (ln(${memberCount} + 1) * 3) for this project`
      )
    );
  }

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
        if (group.task.deletedAt !== null) {
          // Candidate matched a deleted task — do not re-create or re-link.
          return;
        }
        // Attach every candidate's source to the existing task.
        for (const candidate of group.candidates) {
          const pending = lookupPending(candidate);
          if (!pending) {
            continue;
          }
          await group.task.upsertSource(auth, {
            itemId: pending.itemId,
            source: pending.source,
          });
          deduplicated++;

          localLogger.info(
            {
              existingTaskId: group.task.sId,
              itemId: pending.itemId,
              userId: pending.userId,
              source: pending.source,
              createdByType: group.task.createdByType,
            },
            "Project task merge: linked source to existing task (semantic duplicate)"
          );
        }
        return;
      }

      // kind === "new": create one task from the first candidate, attach every
      // other candidate's source to it.
      const primary = lookupPending(group.candidates[0]);
      if (!primary) {
        return;
      }

      const task = await ProjectTaskResource.makeNewWithSource(auth, {
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
          taskId: task.sId,
          itemId: primary.itemId,
          userId: primary.userId,
          source: primary.source,
        },
        "Project task merge: created new task"
      );

      for (let i = 1; i < group.candidates.length; i++) {
        const pending = lookupPending(group.candidates[i]);
        if (!pending) {
          continue;
        }
        await task.upsertSource(auth, {
          itemId: pending.itemId,
          source: pending.source,
        });
        deduplicated++;

        localLogger.info(
          {
            taskId: task.sId,
            itemId: pending.itemId,
            userId: pending.userId,
            source: pending.source,
          },
          "Project task merge: linked source to new task (intra-batch duplicate)"
        );
      }
    },
    { concurrency: 4 }
  );

  // Create unassigned todos directly — no dedup needed since there is no user
  // to group them by.
  await concurrentExecutor(
    unassignedCandidates,
    async (candidate) => {
      const todo = await ProjectTaskResource.makeNewWithSource(auth, {
        blob: {
          spaceId: spaceModelId,
          userId: null,
          createdByType: "agent",
          createdByUserId: null,
          createdByAgentConfigurationId: BUTLER_AGENT_SID,
          agentSuggestionStatus: "pending",
          text: candidate.blob.text,
          status: "todo",
          doneAt: null,
          actorRationale: candidate.blob.reasoningCreatedAt,
        },
        itemId: candidate.itemId,
        source: candidate.source,
      });
      createdNew++;

      localLogger.info(
        {
          todoId: todo.sId,
          itemId: candidate.itemId,
          source: candidate.source,
        },
        "Project todo merge: created new unassigned todo"
      );
    },
    { concurrency: 4 }
  );

  return new Ok({ deduplicated, createdNew });
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

export function actionItemBlob(item: TaskVersionedActionItem): TaskBlob {
  return {
    text: item.shortDescription,
    reasoningCreatedAt: item.detectedCreationRationale,
  };
}
