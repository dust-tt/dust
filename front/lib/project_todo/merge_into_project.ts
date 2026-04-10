// This module merges the latest takeaway snapshots for all conversations in a
// project into project_todo rows. It is called by mergeTodosForProjectActivity,
// which itself is invoked by the per-project projectMergeWorkflow at most once
// per MERGE_THROTTLE_MS (1 hour by default).
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
//   actionItems  (open)    → "follow_ups",      status: "todo"
//   actionItems  (done)    → "follow_ups",      status: "done"
//   keyDecisions (open)    → "key_decisions",   status: "todo"
//   keyDecisions (decided) → "key_decisions",   status: "done"
//   notableFacts           → "notable_updates", status: "todo"

import { getFastestWhitelistedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  batchDeduplicateCandidates,
  type DeduplicateCandidate,
  type DeduplicationMap,
} from "@app/lib/project_todo/deduplicate_candidates";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";

// Stable identifier used when recording the creating actor for butler-created
// project todos. This is not an actual agent configuration sId but a sentinel
// for the internal merge workflow.
const BUTLER_AGENT_SID = "butler";

// ── Types ─────────────────────────────────────────────────────────────────────

type TodoBlob = {
  category: "follow_ups" | "key_decisions" | "notable_updates";
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
  conversationSId: string;
};

// ── Entry point ───────────────────────────────────────────────────────────────

export async function mergeTakeawaysIntoProject(
  auth: Authenticator,
  { spaceId }: { spaceId: string }
): Promise<void> {
  const spaceModelId = getResourceIdFromSId(spaceId);
  if (spaceModelId === null) {
    logger.error({ spaceId }, "Project todo merge: invalid space sId");
    return;
  }

  // Fetch all latest takeaways for the space directly.
  const takeawaysWithSource = await TakeawaysResource.fetchLatestBySpaceId(
    auth,
    { spaceModelId }
  );

  if (takeawaysWithSource.length === 0) {
    return;
  }

  // Batch-fetch conversations by sId.
  const conversationSIds = [
    ...new Set(
      takeawaysWithSource.map(({ conversationSId }) => conversationSId)
    ),
  ];
  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationSIds
  );
  const conversationBySId = new Map<string, ConversationResource>(
    conversations.map((c) => [c.sId, c])
  );

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

  const newCandidates = await collectNewCandidates(auth, {
    takeawaysWithSource,
    conversationBySId,
    usersById,
  });

  if (newCandidates.length === 0) {
    return;
  }

  // ── Phase 2: semantic deduplication ──────────────────────────────────────

  const dedupMap = await buildDeduplicationMap(auth, {
    newCandidates,
    spaceModelId,
  });

  // ── Phase 3: create or link ───────────────────────────────────────────────

  await createOrLinkTodos(auth, {
    newCandidates,
    dedupMap,
    spaceModelId,
  });
}

// ── Phase 1 ───────────────────────────────────────────────────────────────────

// For each (takeaway, item, targetUser) triple: if a source link already exists,
// update the todo's content if it has changed. Otherwise, push the item to the
// returned candidates list for semantic dedup in phase 2.
async function collectNewCandidates(
  auth: Authenticator,
  {
    takeawaysWithSource,
    conversationBySId,
    usersById,
  }: {
    takeawaysWithSource: Array<{
      takeaway: TakeawaysResource;
      conversationSId: string;
    }>;
    conversationBySId: Map<string, ConversationResource>;
    usersById: Map<string, UserResource>;
  }
): Promise<PendingCandidate[]> {
  const newCandidates: PendingCandidate[] = [];

  await concurrentExecutor(
    takeawaysWithSource,
    async ({ takeaway, conversationSId }) => {
      const conversation = conversationBySId.get(conversationSId);
      if (!conversation) {
        logger.warn(
          { conversationSId },
          "Project todo merge: conversation not found, skipping takeaway"
        );
        return;
      }
      const candidates = await collectConversationCandidates(auth, {
        conversationSId,
        takeaway,
        usersById,
      });
      newCandidates.push(...candidates);
    },
    { concurrency: 4 }
  );

  return newCandidates;
}

// Processes one conversation's takeaway: updates todos whose source link already
// exists, and returns items that need to go through dedup + creation.
async function collectConversationCandidates(
  auth: Authenticator,
  {
    conversationSId,
    takeaway,
    usersById,
  }: {
    conversationSId: string;
    takeaway: TakeawaysResource;
    usersById: Map<string, UserResource>;
  }
): Promise<PendingCandidate[]> {
  const candidates: PendingCandidate[] = [];

  function resolveTargetUserIds(userSIds: string[]): ModelId[] {
    return userSIds
      .map((sId) => usersById.get(sId)?.id)
      .filter((id): id is ModelId => id !== undefined);
  }

  async function collectForItem(
    itemId: string,
    targetUserIds: ModelId[],
    blob: TodoBlob
  ): Promise<void> {
    for (const userId of targetUserIds) {
      const existing = await ProjectTodoResource.fetchBySourceId(auth, {
        sourceId: itemId,
        userId,
      });

      if (existing !== null) {
        // Source link exists — update content if it has changed.
        await updateTodoIfChanged(existing, auth, blob);
      } else {
        candidates.push({ itemId, userId, blob, conversationSId });
      }
    }
  }

  for (const item of takeaway.actionItems) {
    const targetUserIds = resolveTargetUserIds(
      item.assigneeUserId ? [item.assigneeUserId] : []
    );
    await collectForItem(item.sId, targetUserIds, actionItemBlob(item));
  }

  for (const item of takeaway.keyDecisions) {
    const targetUserIds = resolveTargetUserIds(item.relevantUserIds);
    await collectForItem(item.sId, targetUserIds, keyDecisionBlob(item));
  }

  for (const item of takeaway.notableFacts) {
    const targetUserIds = resolveTargetUserIds(item.relevantUserIds);
    await collectForItem(item.sId, targetUserIds, notableFactBlob(item));
  }

  return candidates;
}

// ── Phase 2 ───────────────────────────────────────────────────────────────────

// Pre-fetches all existing todos per (userId, category) and runs batch semantic
// deduplication via LLM. Returns an empty map if no model is available, which
// causes all candidates to be treated as new in phase 3.
async function buildDeduplicationMap(
  auth: Authenticator,
  {
    newCandidates,
    spaceModelId,
  }: {
    newCandidates: PendingCandidate[];
    spaceModelId: ModelId;
  }
): Promise<DeduplicationMap> {
  const model = getFastestWhitelistedModel(auth);
  if (!model) {
    logger.warn(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      "Project todo merge: no whitelisted model, skipping deduplication"
    );
    return new Map();
  }

  // Fetch all existing todos for each unique target user in a single pass, then
  // group them by `${userId}:${category}` for efficient lookup in the LLM calls.
  const uniqueUserIds = [...new Set(newCandidates.map((c) => c.userId))];
  const existingTodosByGroup = new Map<string, ProjectTodoResource[]>();

  await concurrentExecutor(
    uniqueUserIds,
    async (userId) => {
      const todos = await ProjectTodoResource.fetchLatestBySpaceForUser(auth, {
        spaceId: spaceModelId,
        userId,
      });
      for (const todo of todos) {
        const key = `${userId}:${todo.category}`;
        const group = existingTodosByGroup.get(key) ?? [];
        group.push(todo);
        existingTodosByGroup.set(key, group);
      }
    },
    { concurrency: 4 }
  );

  const deduplicateCandidates: DeduplicateCandidate[] = newCandidates.map(
    (c) => ({
      itemId: c.itemId,
      userId: c.userId,
      text: c.blob.text,
      category: c.blob.category,
    })
  );

  return batchDeduplicateCandidates(auth, {
    model,
    candidates: deduplicateCandidates,
    existingTodosByGroup,
  });
}

// ── Phase 3 ───────────────────────────────────────────────────────────────────

// For each candidate: if a semantic duplicate was found, attach the source link
// to the existing todo (updating content for agent-created ones if needed).
// Otherwise, create a new todo and link the source.
async function createOrLinkTodos(
  auth: Authenticator,
  {
    newCandidates,
    dedupMap,
    spaceModelId,
  }: {
    newCandidates: PendingCandidate[];
    dedupMap: DeduplicationMap;
    spaceModelId: ModelId;
  }
): Promise<void> {
  await concurrentExecutor(
    newCandidates,
    async (candidate) => {
      const match =
        dedupMap.get(`${candidate.userId}:${candidate.itemId}`) ?? null;

      if (match !== null) {
        // Semantic duplicate found — link the new source to the existing todo.
        await match.addSource(auth, {
          sourceType: "conversation",
          sourceId: candidate.itemId,
        });

        // For agent-created todos also propagate content updates. User-created
        // todos are left untouched: the user's text and status take priority.
        if (match.createdByType === "agent") {
          await updateTodoIfChanged(match, auth, candidate.blob);
        }

        logger.info(
          {
            existingTodoSId: match.sId,
            itemId: candidate.itemId,
            userId: candidate.userId,
            conversationSId: candidate.conversationSId,
            createdByType: match.createdByType,
          },
          "Project todo merge: linked source to existing todo (semantic duplicate)"
        );
        return;
      }

      // No duplicate — create a fresh todo and link the source.
      const todo = await ProjectTodoResource.makeNew(auth, {
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
        version: 1,
      });

      await todo.addSource(auth, {
        sourceType: "conversation",
        sourceId: candidate.itemId,
      });

      logger.info(
        {
          todoSId: todo.sId,
          itemId: candidate.itemId,
          userId: candidate.userId,
          conversationSId: candidate.conversationSId,
        },
        "Project todo merge: created new todo"
      );
    },
    { concurrency: 4 }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Creates a new version of a todo only when text, status, or doneAt has changed.
async function updateTodoIfChanged(
  todo: ProjectTodoResource,
  auth: Authenticator,
  blob: TodoBlob
): Promise<void> {
  const textChanged = todo.text !== blob.text;
  const statusChanged = todo.status !== blob.status;
  const doneAtChanged =
    todo.doneAt?.toISOString() !== blob.doneAt?.toISOString();

  if (textChanged || statusChanged || doneAtChanged) {
    await todo.createVersion(auth, {
      text: blob.text,
      status: blob.status,
      doneAt: blob.doneAt,
    });
  }
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

function actionItemBlob(item: TodoVersionedActionItem): TodoBlob {
  const isDone = item.status === "done";
  return {
    category: "follow_ups",
    text: item.text,
    status: isDone ? "done" : "todo",
    doneAt:
      isDone && item.detectedDoneAt ? new Date(item.detectedDoneAt) : null,
  };
}

function keyDecisionBlob(item: TodoVersionedKeyDecision): TodoBlob {
  return {
    category: "key_decisions",
    text: item.text,
    status: item.status === "decided" ? "done" : "todo",
    doneAt: null,
  };
}

function notableFactBlob(item: TodoVersionedNotableFact): TodoBlob {
  return {
    category: "notable_updates",
    text: item.text,
    status: "todo",
    doneAt: null,
  };
}
