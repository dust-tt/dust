// TODO: implement "merge".
//
// This module will merge the latest takeaway snapshots for all
// conversations in a project into project_todo rows. It is called by
// mergeTodosForProjectActivity, which itself is invoked by the per-project
// projectMergeWorkflow at most once per MERGE_THROTTLE_MS (1 hour by default).
//
//   Pass 1 — per-source lookup (fast path):
//     For each conversation's takeaway, for each item (actionItem / keyDecision /
//     notableFact) and each target user:
//       - Look up existing agent-created ProjectTodo via
//         ProjectTodoResource.fetchBySourceId(auth, { sourceId: itemId, userId }).
//       - found, unchanged → skip
//       - found, changed   → existing.createVersion()
//       - not found        → collect as a deduplication candidate
//
//   Pass 2 — LLM-assisted deduplication:
//     Group candidates by (userId, category). For each group call
//     deduplicateTodoCandidates(), which runs one LLM call against the user's
//     existing todos in that category.
//       - candidate matches existing todo → addSource({ sourceId: itemId }) on the existing todo
//                                           (user-created todos: text is never
//                                           updated — "user wins" policy)
//       - candidate is new               → ProjectTodoResource.makeNew() + addSource({ sourceId: itemId })
//
//   LLM dedup is best-effort: if the call fails, all affected candidates are
//   created as new todos (no false merges, at the cost of some duplicates).
//
// Category mapping:
//   actionItems  (open)    → "follow_ups",      status: "todo"
//   actionItems  (done)    → "follow_ups",      status: "done"
//   keyDecisions (open)    → "key_decisions",   status: "todo"
//   keyDecisions (decided) → "key_decisions",   status: "done"
//   notableFacts           → "notable_updates", status: "todo"

import {getFastestWhitelistedModel} from "@app/lib/assistant";
import type {Authenticator} from "@app/lib/auth";
import {
  type DeduplicationCandidate,
  deduplicateTodoCandidates,
} from "@app/lib/project_todo/deduplicate_todos";
import {ConversationResource} from "@app/lib/resources/conversation_resource";
import {ProjectTodoResource} from "@app/lib/resources/project_todo_resource";
import {getResourceIdFromSId} from "@app/lib/resources/string_ids";
import {TakeawaysResource} from "@app/lib/resources/takeaways_resource";
import {UserResource} from "@app/lib/resources/user_resource";
import {concurrentExecutor} from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {ModelId} from "@app/types/shared/model_id";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";

// Stable identifier used when recording the creating actor for butler-created
// project todos. This is not an actual agent configuration sId but a sentinel
// for the internal merge workflow.
const BUTLER_AGENT_SID = "butler";

type ConversationWithTakeaway = {
  conversation: ConversationResource;
  takeaway: TakeawaysResource;
};

// A candidate that passed the fast-path source lookup without a match and
// needs LLM-assisted deduplication before a new todo is created.
type CollectedCandidate = {
  conversation: ConversationResource;
  itemId: string;
  userId: ModelId;
  blob: TodoBlob;
};

export async function mergeConversationTodosIntoProject (
  auth: Authenticator,
  {spaceId}: { spaceId: string }
): Promise<void> {
  const spaceModelId = getResourceIdFromSId (spaceId);
  if (spaceModelId === null) {
    logger.error ({spaceId}, "Project todo merge: invalid space sId");
    return;
  }

  const conversationTakeaways = await fetchConversationTakeaways (auth, {
    spaceModelId,
  });
  if (conversationTakeaways.length === 0) {
    return;
  }

  const usersById = await fetchUsersById (auth, conversationTakeaways);

  // Pass 1: for each conversation takeaway, run the fast-path per-source lookup.
  // Items already tracked from this conversation are updated in-place; items not
  // yet tracked are collected as deduplication candidates.
  const collectedCandidates: CollectedCandidate[] = [];
  await concurrentExecutor (
    conversationTakeaways,
    async ({conversation, takeaway}) => {
      const candidates = await collectCandidatesFromTakeaway (auth, {
        conversation,
        takeaway,
        usersById,
      });
      collectedCandidates.push (...candidates);
    },
    {concurrency: 4}
  );

  if (collectedCandidates.length === 0) {
    return;
  }

  // Pass 2: LLM-assisted deduplication.
  await runDeduplicationPass (auth, {collectedCandidates, spaceModelId});
}

// Fetches all latest takeaway snapshots for the space and pairs each with its
// source conversation. Because takeaways now carry a spaceId, no conversation
// listing is required — only conversations that actually have takeaways are
// returned.
async function fetchConversationTakeaways (
  auth: Authenticator,
  {spaceModelId}: { spaceModelId: ModelId }
): Promise<ConversationWithTakeaway[]> {
  const takeawaysWithSource = await TakeawaysResource.fetchLatestBySpaceId (
    auth,
    {spaceModelId}
  );

  if (takeawaysWithSource.length === 0) {
    return [];
  }

  // Batch-fetch conversations by sId — needed to pass ConversationResource
  // objects to the candidate collector (for logging and future use).
  const conversationSIds = [
    ...new Set (
      takeawaysWithSource.map (({conversationSId}) => conversationSId)
    ),
  ];
  const conversations = await ConversationResource.fetchByIds (
    auth,
    conversationSIds
  );
  const conversationBySId = new Map<string, ConversationResource> (
    conversations.map ((c) => [c.sId, c])
  );

  const result: ConversationWithTakeaway[] = [];
  for (const {takeaway, conversationSId} of takeawaysWithSource) {
    const conversation = conversationBySId.get (conversationSId);
    if (!conversation) {
      logger.warn (
        {conversationSId},
        "Project todo merge: conversation not found, skipping takeaway"
      );
      continue;
    }
    result.push ({conversation, takeaway});
  }
  return result;
}

// Collects all user sIds referenced across the takeaways (assignees, relevant
// users) and batch-fetches the corresponding UserResources in a single query.
async function fetchUsersById (
  auth: Authenticator,
  conversationTakeaways: ConversationWithTakeaway[]
): Promise<Map<string, UserResource>> {
  const allUserIds = new Set<string> ();
  for (const {takeaway} of conversationTakeaways) {
    for (const item of takeaway.actionItems) {
      if (item.assigneeUserId) {
        allUserIds.add (item.assigneeUserId);
      }
    }
    for (const item of takeaway.keyDecisions) {
      for (const userId of item.relevantUserIds) {
        allUserIds.add (userId);
      }
    }
    for (const item of takeaway.notableFacts) {
      for (const userId of item.relevantUserIds) {
        allUserIds.add (userId);
      }
    }
  }

  const users =
    allUserIds.size > 0 ? await UserResource.fetchByIds ([...allUserIds]) : [];
  return new Map (users.map ((u) => [u.sId, u]));
}

// Pass 2: assigns each candidate a stable index, calls deduplicateTodoCandidates,
// then either links the source to a matched existing todo or creates a new one.
async function runDeduplicationPass (
  auth: Authenticator,
  {
    collectedCandidates,
    spaceModelId,
  }: {
    collectedCandidates: CollectedCandidate[];
    spaceModelId: ModelId;
  }
): Promise<void> {
  const deduplicationCandidates: DeduplicationCandidate[] =
    collectedCandidates.map ((c, i) => ({
      index: i,
      text: c.blob.text,
      category: c.blob.category,
      userId: c.userId,
    }));

  const model = getFastestWhitelistedModel (auth);
  if (!model) {
    logger.warn (
      {workspaceId: auth.getNonNullableWorkspace ().sId},
      "Project todo merge: no whitelisted model — skipping dedup, creating all candidates as new"
    );
    await createAllCandidates (auth, {
      candidates: collectedCandidates,
      spaceModelId,
    });
    return;
  }

  const deduplicationResult = await deduplicateTodoCandidates (auth, {
    spaceModelId,
    candidates: deduplicationCandidates,
    model,
  });

  await concurrentExecutor (
    collectedCandidates.map ((candidate, index) => ({candidate, index})),
    async ({candidate, index}) => {
      const existingTodo = deduplicationResult.get (index);

      if (existingTodo) {
        // Duplicate detected. Attach the source item as an additional source
        // without modifying the todo's text or status ("user wins" policy:
        // user-created todos are never updated; agent-created canonical todos
        // are also left unchanged so the first source remains authoritative).
        await existingTodo.addSource (auth, {
          sourceType: "conversation",
          sourceId: candidate.itemId,
        });
        logger.info (
          {
            existingTodoSId: existingTodo.sId,
            conversationId: candidate.conversation.id,
            itemId: candidate.itemId,
            userId: candidate.userId,
          },
          "Project todo merge: linked duplicate candidate to existing todo"
        );
        return;
      }

      await createTodoFromCandidate (auth, {candidate, spaceModelId});
    },
    {concurrency: 4}
  );
}

// ── Pass-1 helpers ────────────────────────────────────────────────────────────

// Processes one conversation's takeaway snapshot. For each item+user pair,
// performs the fast-path source lookup:
//   - found, unchanged → skip
//   - found, changed   → createVersion()
//   - not found        → collect as a candidate for Pass 2
async function collectCandidatesFromTakeaway (
  auth: Authenticator,
  {
    conversation,
    takeaway,
    usersById,
  }: {
    conversation: ConversationResource;
    takeaway: TakeawaysResource;
    usersById: Map<string, UserResource>;
  }
): Promise<CollectedCandidate[]> {
  const candidates: CollectedCandidate[] = [];

  function resolveTargetUserIds (userIds: string[]): ModelId[] {
    return userIds
      .map ((sId) => usersById.get (sId)?.id)
      .filter ((id): id is ModelId => id !== undefined);
  }

  async function collectForItem (
    itemId: string,
    targetUserIds: ModelId[],
    makeBlob: () => TodoBlob
  ): Promise<void> {
    await concurrentExecutor (
      targetUserIds,
      async (userId) => {
        const existing = await ProjectTodoResource.fetchBySourceId (auth, {
          sourceId: itemId,
          userId,
        });

        const blob = makeBlob ();

        if (existing !== null) {
          // The todo from this conversation already exists. Create a new version
          // only if the wording or completion state has changed.
          const textChanged = existing.text !== blob.text;
          const statusChanged = existing.status !== blob.status;
          const doneAtChanged =
            existing.doneAt?.toISOString () !== blob.doneAt?.toISOString ();

          if (textChanged || statusChanged || doneAtChanged) {
            await existing.createVersion (auth, {
              text: blob.text,
              status: blob.status,
              doneAt: blob.doneAt,
            });
          }
          return;
        }

        // No existing todo for this conversation+item+user — hand off to Pass 2.
        candidates.push ({conversation, itemId, userId, blob});
      },
      {concurrency: 4}
    );
  }

  // Flatten all item types into a single list and process them concurrently.
  // Items are independent — no item within a takeaway depends on another.
  type ItemTask = {
    itemId: string;
    targetUserIds: ModelId[];
    makeBlob: () => TodoBlob;
  };

  const itemTasks: ItemTask[] = [
    ...takeaway.actionItems.map (
      (item): ItemTask => ({
        itemId: item.sId,
        targetUserIds: resolveTargetUserIds (
          item.assigneeUserId ? [item.assigneeUserId] : []
        ),
        makeBlob: () => actionItemBlob (item),
      })
    ),
    ...takeaway.keyDecisions.map (
      (item): ItemTask => ({
        itemId: item.sId,
        targetUserIds: resolveTargetUserIds (item.relevantUserIds),
        makeBlob: () => keyDecisionBlob (item),
      })
    ),
    ...takeaway.notableFacts.map (
      (item): ItemTask => ({
        itemId: item.sId,
        targetUserIds: resolveTargetUserIds (item.relevantUserIds),
        makeBlob: () => notableFactBlob (item),
      })
    ),
  ];

  await concurrentExecutor (
    itemTasks,
    ({itemId, targetUserIds, makeBlob}) =>
      collectForItem (itemId, targetUserIds, makeBlob),
    {concurrency: 4}
  );

  return candidates;
}

// ── Pass-2 helpers ────────────────────────────────────────────────────────────

// Creates a new ProjectTodo and links it to its source conversation.
async function createTodoFromCandidate (
  auth: Authenticator,
  {
    candidate,
    spaceModelId,
  }: {
    candidate: CollectedCandidate;
    spaceModelId: ModelId;
  }
): Promise<void> {
  const {conversation, itemId, userId, blob} = candidate;

  const todo = await ProjectTodoResource.makeNew (auth, {
    spaceId: spaceModelId,
    userId,
    createdByType: "agent",
    createdByUserId: null,
    createdByAgentConfigurationId: BUTLER_AGENT_SID,
    category: blob.category,
    text: blob.text,
    status: blob.status,
    doneAt: blob.doneAt,
    actorRationale: null,
    markedAsDoneByType: null,
    markedAsDoneByUserId: null,
    markedAsDoneByAgentConfigurationId: null,
    version: 1,
  });

  await todo.addSource (auth, {
    sourceType: "conversation",
    sourceId: itemId,
  });

  logger.info (
    {
      todoSId: todo.sId,
      conversationId: conversation.id,
      itemId,
      userId,
    },
    "Project todo merge: created new todo"
  );
}

// Fallback: create all candidates as new todos without deduplication.
// Used when no LLM model is available.
async function createAllCandidates (
  auth: Authenticator,
  {
    candidates,
    spaceModelId,
  }: {
    candidates: CollectedCandidate[];
    spaceModelId: ModelId;
  }
): Promise<void> {
  await concurrentExecutor (
    candidates,
    async (candidate) =>
      createTodoFromCandidate (auth, {candidate, spaceModelId}),
    {concurrency: 4}
  );
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

type TodoBlob = {
  category: "follow_ups" | "key_decisions" | "notable_updates";
  text: string;
  status: "todo" | "done";
  doneAt: Date | null;
};

function actionItemBlob (item: TodoVersionedActionItem): TodoBlob {
  const isDone = item.status === "done";
  return {
    category: "follow_ups",
    text: item.text,
    status: isDone ? "done" : "todo",
    doneAt:
      isDone && item.detectedDoneAt ? new Date (item.detectedDoneAt) : null,
  };
}

function keyDecisionBlob (item: TodoVersionedKeyDecision): TodoBlob {
  return {
    category: "key_decisions",
    text: item.text,
    status: item.status === "decided" ? "done" : "todo",
    doneAt: null,
  };
}

function notableFactBlob (item: TodoVersionedNotableFact): TodoBlob {
  return {
    category: "notable_updates",
    text: item.text,
    status: "todo",
    doneAt: null,
  };

}
