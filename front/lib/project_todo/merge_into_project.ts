// This module merges the latest takeaway snapshots for all conversations in a
// project into project_todo rows. It is called by mergeTodosForProjectActivity,
// which itself is invoked by the per-project projectMergeWorkflow at most once
// per MERGE_THROTTLE_MS (1 hour by default).
//
// High-level algorithm:
//
//   1. Fetch all takeaway snapshots (latest per conversation) for
//      conversations that belong to the given spaceId.
//   2. For each item (actionItem / keyDecision / notableFact):
//        - Resolve target users (assigneeUserId, relevantUserIds, or conversation participants).
//        - For each target user, look up existing agent-created ProjectTodo via
//          ProjectTodoResource.fetchBySourceId(auth, { sourceId: itemId, userId }).
//        - not found  → ProjectTodoResource.makeNew() + addSource({ sourceId: itemId })
//        - found, changed  → existing.createVersion()
//        - found, unchanged → skip
//   3. For each agent-created ProjectTodo whose sourceId is absent from
//      the latest snapshot → createVersion({ status: "done", markedAsDoneByType: "agent" }).
//
// Category mapping:
//   actionItems  (open)    → "follow_ups",      status: "todo"
//   actionItems  (done)    → "follow_ups",      status: "done"
//   keyDecisions (open)    → "key_decisions",   status: "todo"
//   keyDecisions (decided) → "key_decisions",   status: "done"
//   notableFacts           → "notable_updates", status: "todo"

import type { Authenticator } from "@app/lib/auth";
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

export async function mergeTakeawaysIntoProject(
  auth: Authenticator,
  { spaceId }: { spaceId: string }
): Promise<void> {
  const spaceModelId = getResourceIdFromSId(spaceId);
  if (spaceModelId === null) {
    logger.error({ spaceId }, "Project todo merge: invalid space sId");
    return;
  }

  // 1. Fetch all latest takeaways for the space directly
  const takeawaysWithSource = await TakeawaysResource.fetchLatestBySpaceId(
    auth,
    { spaceModelId }
  );

  if (takeawaysWithSource.length === 0) {
    return;
  }

  // Batch-fetch conversations by sId — needed to pass ConversationResource
  // objects to the item processor (for logging and future use).
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

  // 2. For each takeaway, create new project todos for any items that do not
  //    already have a corresponding todo for a given target user.
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
      await processConversationTakeaway(auth, {
        conversation,
        takeaway,
        spaceModelId,
        usersById,
      });
    },
    { concurrency: 4 }
  );
}

async function processConversationTakeaway(
  auth: Authenticator,
  {
    conversation,
    takeaway,
    spaceModelId,
    usersById,
  }: {
    conversation: ConversationResource;
    takeaway: TakeawaysResource;
    spaceModelId: ModelId;
    usersById: Map<string, UserResource>;
  }
): Promise<void> {
  // Resolve target user ModelIds for a given set of user sIds
  async function resolveTargetUserIds(userIds: string[]): Promise<ModelId[]> {
    return userIds
      .map((sId) => usersById.get(sId)?.id)
      .filter((id): id is ModelId => id !== undefined);
  }

  // Process action items → "follow_ups" category.
  for (const item of takeaway.actionItems) {
    const targetUserIds = await resolveTargetUserIds(
      item.assigneeUserId ? [item.assigneeUserId] : []
    );
    await createNewTodosForItem(auth, {
      conversation,
      spaceModelId,
      itemId: item.sId,
      targetUserIds,
      makeBlob: () => actionItemBlob(item),
    });
  }

  // Process key decisions → "key_decisions" category.
  for (const item of takeaway.keyDecisions) {
    const targetUserIds = await resolveTargetUserIds(item.relevantUserIds);
    await createNewTodosForItem(auth, {
      conversation,
      spaceModelId,
      itemId: item.sId,
      targetUserIds,
      makeBlob: () => keyDecisionBlob(item),
    });
  }

  // Process notable facts → "notable_updates" category.
  for (const item of takeaway.notableFacts) {
    const targetUserIds = await resolveTargetUserIds(item.relevantUserIds);
    await createNewTodosForItem(auth, {
      conversation,
      spaceModelId,
      itemId: item.sId,
      targetUserIds,
      makeBlob: () => notableFactBlob(item),
    });
  }
}

// For each target user, checks whether a project todo already exists for this
// source item. If not, creates one and links it to the source.
async function createNewTodosForItem(
  auth: Authenticator,
  {
    conversation,
    spaceModelId,
    itemId,
    targetUserIds,
    makeBlob,
  }: {
    conversation: ConversationResource;
    spaceModelId: ModelId;
    itemId: string;
    targetUserIds: ModelId[];
    makeBlob: () => TodoBlob;
  }
): Promise<void> {
  await concurrentExecutor(
    targetUserIds,
    async (userId) => {
      const existing = await ProjectTodoResource.fetchBySourceId(auth, {
        sourceId: itemId,
        userId,
      });

      const blob = makeBlob();

      if (existing !== null) {
        // The todo already exists. Create a new version only if the wording or
        // completion state has changed since it was last recorded.
        const textChanged = existing.text !== blob.text;
        const statusChanged = existing.status !== blob.status;
        const doneAtChanged =
          existing.doneAt?.toISOString() !== blob.doneAt?.toISOString();

        if (textChanged || statusChanged || doneAtChanged) {
          await existing.createVersion(auth, {
            text: blob.text,
            status: blob.status,
            doneAt: blob.doneAt,
          });
        }
        return;
      }
      const todo = await ProjectTodoResource.makeNew(auth, {
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

      await todo.addSource(auth, {
        sourceType: "conversation",
        sourceId: itemId,
      });

      logger.info(
        {
          todoSId: todo.sId,
          conversationId: conversation.id,
          itemId,
          userId,
        },
        "Project todo merge: created new todo"
      );
    },
    { concurrency: 4 }
  );
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

type TodoBlob = {
  category: "follow_ups" | "key_decisions" | "notable_updates";
  text: string;
  status: "todo" | "done";
  doneAt: Date | null;
};

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
