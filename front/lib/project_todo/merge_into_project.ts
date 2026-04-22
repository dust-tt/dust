// This module merges the latest takeaway snapshots for all conversations in a
// project into project_todo rows. It is called by mergeTodosForProjectActivity,
// which itself is invoked by the per-project projectTodoWorkflow at most once
// per hour (based on the cron schedule).
//
// High-level algorithm (2 phases):
//
//   Phase 1 — Collect new candidates.
//     For every (takeaway, item, targetUser) triple:
//       - fetchByItemIds(itemId, userId):
//           found     → update text/status/doneAt if changed (no new row)
//           not found → push to newCandidates[]
//
//   Phase 2 — Process each (userId, category) group as one pipelined pass.
//     For each group of candidates, in parallel (up to 4 groups at once):
//       - Fetch existing todos for this (user, category) once.
//       - Run the dedup LLM (if any candidates or existing todos remain).
//       - Walk candidates in order, sequentially within the group:
//           existing(todo) → upsertSource + maybe update content.
//           leader         → makeNewWithSource (and remember as leader).
//           follower(key)  → upsertSource on the already-created leader todo.
//     Leaders-before-followers is guaranteed by the in-order walk because
//     the dedup LLM is instructed to only reference earlier candidates.
//
// Category mapping:
//   actionItems  (open)    → "to_do",   status: "todo"
//   actionItems  (done)    → "to_do",   status: "done"
//   keyDecisions (open)    → "to_know", status: "todo"
//   keyDecisions (decided) → "to_know", status: "todo"
//   notableFacts           → "to_know", status: "todo"

import { getFastestWhitelistedModel } from "@app/lib/assistant";
import { Authenticator } from "@app/lib/auth";
import {
  type DeduplicateCandidate,
  makeDedupResultKey,
  resolveDeduplicationChains,
  runDeduplicationLLMCall,
} from "@app/lib/project_todo/deduplicate_candidates";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import {
  TakeawaysResource,
  type TakeawaysWithSource,
} from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ProjectTodoSourceInfo } from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";
import type { Logger } from "pino";

// Stable identifier used when recording the creating actor for butler-created
// project todos. This is not an actual agent configuration sId but a sentinel
// for the internal merge workflow.
const BUTLER_AGENT_SID = "butler";

// ── Types ─────────────────────────────────────────────────────────────────────

type TodoBlob = {
  category: "to_do" | "to_know";
  text: string;
  status: "todo" | "done";
  doneAt: Date | null;
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
  const takeawaysWithSource = await TakeawaysResource.fetchLatestBySpaceId(
    adminAuth,
    { spaceModelId }
  );

  stats.takeawaysProcessed = takeawaysWithSource.length;

  if (takeawaysWithSource.length === 0) {
    localLogger.info("Project todo merge: no takeaways found, skipping");
    return stats;
  }

  // Collect all user sIds referenced across all takeaways so we can batch-fetch
  // the corresponding UserResources in a single query.
  const allUserIds = new Set<string>();
  for (const { takeaway } of takeawaysWithSource) {
    for (const item of takeaway.actionItems) {
      if (item.assigneeUserId) {
        allUserIds.add(item.assigneeUserId);
      }
    }
    for (const item of takeaway.keyDecisions) {
      for (const userId of item.relevantUserIds) {
        allUserIds.add(userId);
      }
    }
    for (const item of takeaway.notableFacts) {
      for (const userId of item.relevantUserIds) {
        allUserIds.add(userId);
      }
    }
  }

  const users =
    allUserIds.size > 0 ? await UserResource.fetchByIds([...allUserIds]) : [];
  const usersById = new Map<string, UserResource>(users.map((u) => [u.sId, u]));

  // ── Phase 1: collect new candidates, update already-linked items ──────────

  const { candidates: newCandidates, existingUpdated } =
    await collectNewCandidates(adminAuth, {
      takeawaysWithSource,
      usersById,
    });

  stats.candidatesCollected = newCandidates.length;
  stats.existingUpdated = existingUpdated;

  if (newCandidates.length === 0) {
    localLogger.info("Project todo merge: no new candidates found, skipping");
    return stats;
  }

  // ── Phase 2: one pipelined pass per (userId, category) group ─────────────

  const model = getFastestWhitelistedModel(adminAuth);
  if (!model) {
    localLogger.warn(
      "Project todo merge: no whitelisted model — skipping dedup, every candidate becomes a new todo"
    );
  }

  // Group candidates by (userId, category). Followers can only reference
  // earlier candidates in the same group, so the in-order walk inside
  // processGroup trivially satisfies leaders-before-followers.
  const byGroup = new Map<string, PendingCandidate[]>();
  for (const c of newCandidates) {
    const key = `${c.userId}:${c.blob.category}`;
    const bucket = byGroup.get(key) ?? [];
    bucket.push(c);
    byGroup.set(key, bucket);
  }

  const groupResults = await concurrentExecutor(
    Array.from(byGroup.values()),
    (groupCandidates) =>
      processGroup(adminAuth, {
        localLogger,
        candidates: groupCandidates,
        model,
        spaceModelId,
      }),
    { concurrency: 4 }
  );

  for (const { deduplicated, createdNew } of groupResults) {
    stats.deduplicated += deduplicated;
    stats.createdNew += createdNew;
  }

  return stats;
}

// ── Phase 1 ───────────────────────────────────────────────────────────────────

// For each (takeaway, item, targetUser) triple: if a source link already exists,
// update the todo's content if it has changed. Otherwise, push the item to the
// returned candidates list for semantic dedup in phase 2.
async function collectNewCandidates(
  auth: Authenticator,
  {
    takeawaysWithSource,
    usersById,
  }: {
    takeawaysWithSource: TakeawaysWithSource[];
    usersById: Map<string, UserResource>;
  }
): Promise<{ candidates: PendingCandidate[]; existingUpdated: number }> {
  const newCandidates: PendingCandidate[] = [];
  let existingUpdated = 0;

  await concurrentExecutor(
    takeawaysWithSource,
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
// exists, and returns items that need to go through dedup + creation.
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
  const itemTriples: Array<{
    itemId: string;
    targetUserIds: ModelId[];
    blob: TodoBlob;
  }> = [
    ...takeawayWithSource.takeaway.actionItems.map((item) => ({
      itemId: item.sId,
      targetUserIds: resolveTargetUserIds(
        item.assigneeUserId ? [item.assigneeUserId] : []
      ),
      blob: actionItemBlob(item),
    })),
    ...takeawayWithSource.takeaway.keyDecisions.map((item) => ({
      itemId: item.sId,
      targetUserIds: resolveTargetUserIds(item.relevantUserIds),
      blob: keyDecisionBlob(item),
    })),
    ...takeawayWithSource.takeaway.notableFacts.map((item) => ({
      itemId: item.sId,
      targetUserIds: resolveTargetUserIds(item.relevantUserIds),
      blob: notableFactBlob(item),
    })),
  ];

  // Batch-fetch existing todos by itemId. The result map is keyed by
  // `${itemId}:${userId}`, matching the lookup below so a hit means
  // "this (item, user) pair is already linked to a todo — skip dedup".
  const allItemIds = itemTriples.map((t) => t.itemId);
  const existingByKey = await ProjectTodoResource.fetchByItemIds(auth, {
    itemIds: allItemIds,
  });

  const candidates: PendingCandidate[] = [];
  let existingUpdated = 0;
  for (const { itemId, targetUserIds, blob } of itemTriples) {
    for (const userId of targetUserIds) {
      const existing =
        existingByKey.get({ itemId, userModelId: userId }) ?? null;
      if (existing !== null) {
        // Source link exists — update content if it has changed.
        const updated = await updateTodoIfChanged(existing, auth, blob);
        if (updated) {
          existingUpdated++;
        }
      } else {
        candidates.push({
          itemId,
          userId,
          blob,
          source: takeawayWithSource.source,
        });
      }
    }
  }

  return { candidates, existingUpdated };
}

// ── Phase 2: process one (userId, category) group end-to-end ─────────────────

// Fetches existing todos, runs the dedup LLM, and then walks candidates
// sequentially to create / link todos. All candidates in `groupCandidates`
// must share the same (userId, category); the caller (mergeTakeawaysIntoProject)
// partitions by `${userId}:${category}` before dispatching groups.
async function processGroup(
  auth: Authenticator,
  {
    localLogger,
    candidates,
    model,
    spaceModelId,
  }: {
    localLogger: Logger;
    candidates: PendingCandidate[];
    // null when no whitelisted model is available — every candidate becomes
    // a leader without an LLM call.
    model: ModelConfigurationType | null;
    spaceModelId: ModelId;
  }
): Promise<{ deduplicated: number; createdNew: number }> {
  let deduplicated = 0;
  let createdNew = 0;

  if (candidates.length === 0) {
    return { deduplicated, createdNew };
  }

  // Precondition: all candidates share (userId, category) by construction.
  const { userId } = candidates[0];
  const category = candidates[0].blob.category;

  // Fetch once: all existing todos for this user, then filter to category.
  const userTodos = await ProjectTodoResource.fetchLatestBySpaceForUser(auth, {
    spaceId: spaceModelId,
    userId,
  });
  const existingTodos = userTodos.filter((t) => t.category === category);

  // Run the dedup LLM unless there is literally nothing to compare against
  // (a lone new candidate with no existing todos in this group — the LLM
  // would only echo "new" in that case).
  const dedupCandidates: DeduplicateCandidate[] = candidates.map((c) => ({
    itemId: c.itemId,
    userId: c.userId,
    text: c.blob.text,
    category: c.blob.category,
  }));
  const shouldCallLLM =
    model !== null && (existingTodos.length > 0 || candidates.length > 1);
  const resolutions = shouldCallLLM
    ? resolveDeduplicationChains(
        dedupCandidates,
        await runDeduplicationLLMCall(auth, {
          model: model as ModelConfigurationType,
          candidates: dedupCandidates,
          existingTodos,
        }),
        existingTodos
      )
    : new Map();

  // Map from candidate key → todo created for that candidate. Populated as
  // we iterate so followers later in the group can look up their leader's
  // todo without hitting the database.
  const leaderTodos = new Map<string, ProjectTodoResource>();

  for (const candidate of candidates) {
    const candidateKey = makeDedupResultKey(candidate.userId, candidate.itemId);
    const resolution = resolutions.get(candidateKey);

    if (resolution?.kind === "existing") {
      // Semantic duplicate of an existing todo — link source + maybe update.
      await resolution.todo.upsertSource(auth, {
        itemId: candidate.itemId,
        source: candidate.source,
      });
      // User-intent guard lives in updateTodoIfChanged — no-op when the
      // target todo was created by a user or already marked done by one.
      await updateTodoIfChanged(resolution.todo, auth, candidate.blob);
      deduplicated++;

      localLogger.info(
        {
          existingTodoId: resolution.todo.sId,
          itemId: candidate.itemId,
          userId: candidate.userId,
          source: candidate.source,
          createdByType: resolution.todo.createdByType,
        },
        "Project todo merge: linked source to existing todo (semantic duplicate)"
      );
      continue;
    }

    if (resolution?.kind === "follower") {
      const leader = leaderTodos.get(resolution.leaderKey);
      if (leader) {
        await leader.upsertSource(auth, {
          itemId: candidate.itemId,
          source: candidate.source,
        });
        deduplicated++;

        localLogger.info(
          {
            leaderTodoId: leader.sId,
            itemId: candidate.itemId,
            userId: candidate.userId,
            source: candidate.source,
          },
          "Project todo merge: linked source to leader todo (intra-batch duplicate)"
        );
        continue;
      }
      // Defensive: the chain resolver should have ensured the leader
      // appears earlier in this group. If not, fall through and create a
      // fresh todo rather than silently dropping the candidate's source.
      localLogger.warn(
        {
          itemId: candidate.itemId,
          userId: candidate.userId,
          leaderKey: resolution.leaderKey,
        },
        "Project todo merge: follower without leader, promoting to new todo"
      );
    }

    // Leader, or follower-without-leader fallback, or no resolution at
    // all — create a fresh todo. Atomic so Temporal retries can't leave
    // an orphan row.
    const todo = await ProjectTodoResource.makeNewWithSource(auth, {
      blob: {
        spaceId: spaceModelId,
        userId: candidate.userId,
        createdByType: "agent",
        createdByUserId: null,
        createdByAgentConfigurationId: BUTLER_AGENT_SID,
        category: candidate.blob.category,
        text: candidate.blob.text,
        status: candidate.blob.status,
        doneAt: candidate.blob.doneAt,
        actorRationale: null,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
      },
      itemId: candidate.itemId,
      source: candidate.source,
    });

    // Record this candidate as a potential leader so later same-group
    // followers can attach to it. The fallback path writes here too to
    // keep "follower without leader" recoverable.
    leaderTodos.set(candidateKey, todo);
    createdNew++;

    localLogger.info(
      {
        todoId: todo.sId,
        itemId: candidate.itemId,
        userId: candidate.userId,
        source: candidate.source,
      },
      "Project todo merge: created new todo"
    );
  }

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

  if (textChanged || statusChanged || doneAtChanged) {
    await todo.updateWithVersion(auth, {
      text: blob.text,
      status: blob.status,
      doneAt: blob.doneAt,
    });
    return true;
  }
  return false;
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

export function actionItemBlob(item: TodoVersionedActionItem): TodoBlob {
  const isDone = item.status === "done";
  return {
    category: "to_do",
    text: item.shortDescription,
    status: isDone ? "done" : "todo",
    doneAt:
      isDone && item.detectedDoneAt ? new Date(item.detectedDoneAt) : null,
  };
}

export function keyDecisionBlob(item: TodoVersionedKeyDecision): TodoBlob {
  return {
    category: "to_know",
    text: item.shortDescription,
    status: "todo",
    doneAt: null,
  };
}

export function notableFactBlob(item: TodoVersionedNotableFact): TodoBlob {
  return {
    category: "to_know",
    text: item.shortDescription,
    status: "todo",
    doneAt: null,
  };
}
