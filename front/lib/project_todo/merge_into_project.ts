// Merges the latest conversation_todo_versioned snapshots for all conversations
// in a project space into project_todo rows. Called by
// mergeTodosForProjectActivity, which is invoked by the per-project
// projectMergeWorkflow at most once per MERGE_THROTTLE_MS (1 hour by default).
//
// Category mapping:
//   actionItems  (open)    → "follow_ups",      status: "todo"
//   actionItems  (done)    → "follow_ups",      status: "done"
//   keyDecisions (open)    → "key_decisions",   status: "todo"   [future]
//   keyDecisions (decided) → "key_decisions",   status: "done"   [future]
//   notableFacts           → "notable_updates", status: "todo"   [future]

import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationTodoVersionedResource } from "@app/lib/resources/conversation_todo_versioned_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";

// Stable identifier used as the agent creator/completer of project todos
// managed by the merge workflow.
export const PROJECT_TODO_AGENT_CONFIGURATION_ID = "project_todo_analyzer";

// Maximum number of conversations processed in parallel during a merge run.
const MERGE_CONCURRENCY = 5;

/**

The Algorithm: "Sync the team's to-do list" - It runs in 5 phases:
* Phase 1 — Find the conversations - "Which conversations belong to this project?"
* Phase 2 — Find out who was there - "Who participated in each conversation?"
	* We bulk-load all participants in one go. We'll need them later because each action item creates one to-do per participant (everyone in the conversation gets the task).
* Phase 3 — Load the existing to-do list - "What does the to-do list currently look like?"
	* We load every existing `follow_ups` todo for this project, along with metadata about where it came from (which conversation, which specific action item in that conversation).
	* Then we build a fast lookup table — a Map with a key like "conversationId:actionItemSId:userId" — so we can check in O(1) whether a todo already exists.
* Phase 4 — Go through each conversation and upsert
	* For each conversation:
		1. Fetch the latest snapshot of action items for that conversation.
		2. For each action item × each participant:
		   * Not in the lookup? → Create a new todo. Wrap the creation + linking in a transaction so we never get an orphaned todo with no source
		   * Already exists but text or status changed? → Create a new version of the todo (bump its version number). If it just became "done", record who marked it done.
		   * Identical? → Skip it. Nothing to do.
* Phase 5 — Auto-done stale todos - "What if we dropped an action item from its latest snapshot — does that mean it's done?"
	* Yes! If a todo existed before, is not already marked done, and its source action item is no longer in the latest snapshot, we mark it done automatically. We "saw" it resolved and stopped tracking it.

*/
export async function mergeConversationTodosIntoProject(
  auth: Authenticator,
  { spaceSId }: { spaceSId: string }
): Promise<void> {
  const space = await SpaceResource.fetchById(auth, spaceSId);
  if (!space) {
    return;
  }

  const spaceId = space.id;

  // 1. Fetch all conversation ids that belong to this space.
  const conversationIds = await ConversationResource.fetchIdsBySpaceId(auth, {
    spaceId,
  });

  if (conversationIds.length === 0) {
    return;
  }

  // 2. Bulk-load participants for all conversations in one query.
  //    Map<conversationId, userId[]>.
  const participantsByConversation =
    await ConversationResource.fetchParticipantUserIdsByConversationIds(auth, {
      conversationIds,
    });

  // 3. Load all existing follow_ups todos with their sources so we can do O(1)
  //    upsert lookups and drive the auto-done step without per-item queries.
  const existingWithSources =
    await ProjectTodoResource.fetchLatestBySpaceWithSources(auth, {
      spaceId,
      category: "follow_ups",
    });

  // Build lookup: "<conversationId>:<actionItemSId>:<userId>" -> latest todo.
  const todoLookup = new Map<string, ProjectTodoResource>();
  for (const {
    todo,
    sourceConversationId,
    conversationTodoVersionedActionItemSId,
  } of existingWithSources) {
    if (
      sourceConversationId !== null &&
      conversationTodoVersionedActionItemSId !== null
    ) {
      const key = `${sourceConversationId}:${conversationTodoVersionedActionItemSId}:${todo.userId}`;
      todoLookup.set(key, todo);
    }
  }

  // 4. Process each conversation: fetch the latest snapshot and upsert todos.
  //    Also record which action item sIds are still active (for the auto-done step).
  //
  //    The nested loop over (actionItems x participants) is O(n^2) in the worst
  //    case but bounded in practice: a conversation typically has < 10 action
  //    items and < 20 participants.
  const activeItemSIdsByConversation = new Map<ModelId, Set<string>>();

  await concurrentExecutor(
    conversationIds,
    async (conversationId) => {
      const snapshot =
        await ConversationTodoVersionedResource.fetchLatestByConversation(
          auth,
          { conversationId }
        );

      if (!snapshot || snapshot.actionItems.length === 0) {
        activeItemSIdsByConversation.set(conversationId, new Set());
        return;
      }

      activeItemSIdsByConversation.set(
        conversationId,
        new Set(snapshot.actionItems.map((i) => i.sId))
      );

      const participants = participantsByConversation.get(conversationId) ?? [];
      if (participants.length === 0) {
        return;
      }

      for (const item of snapshot.actionItems) {
        const desiredStatus = item.status === "done" ? "done" : "todo";
        const isNewlyDone = desiredStatus === "done";

        for (const userId of participants) {
          const key = `${conversationId}:${item.sId}:${userId}`;
          const existing = todoLookup.get(key);

          if (!existing) {
            // Create the ProjectTodo and link it back to the source item
            // atomically so a failed addSource never leaves an orphaned todo.
            await withTransaction(async (t) => {
              const created = await ProjectTodoResource.makeNew(
                auth,
                {
                  spaceId,
                  userId,
                  category: "follow_ups",
                  text: item.text,
                  status: desiredStatus,
                  version: 1,
                  createdByType: "agent",
                  createdByUserId: null,
                  createdByAgentConfigurationId:
                    PROJECT_TODO_AGENT_CONFIGURATION_ID,
                  doneAt: isNewlyDone ? new Date() : null,
                  actorRationale: item.detectedDoneRationale ?? null,
                  markedAsDoneByType: isNewlyDone ? "agent" : null,
                  markedAsDoneByUserId: null,
                  markedAsDoneByAgentConfigurationId: isNewlyDone
                    ? PROJECT_TODO_AGENT_CONFIGURATION_ID
                    : null,
                },
                t
              );

              await created.addSource(
                auth,
                {
                  sourceType: "conversation",
                  sourceConversationId: conversationId,
                  conversationTodoVersionedActionItemSId: item.sId,
                },
                t
              );
            });
          } else if (
            existing.text !== item.text ||
            existing.status !== desiredStatus
          ) {
            // Text or status changed -- create a new version.
            const transitioningToDone =
              isNewlyDone && existing.status !== "done";

            await existing.createVersion(auth, {
              text: item.text,
              status: desiredStatus,
              doneAt: transitioningToDone
                ? new Date()
                : (existing.doneAt ?? null),
              actorRationale: item.detectedDoneRationale ?? null,
              ...(transitioningToDone
                ? {
                    markedAsDoneByType: "agent" as const,
                    markedAsDoneByAgentConfigurationId:
                      PROJECT_TODO_AGENT_CONFIGURATION_ID,
                  }
                : {}),
            });
          }
          // Unchanged -- skip.
        }
      }
    },
    { concurrency: MERGE_CONCURRENCY }
  );

  // 5. Auto-done: mark todos (regardless of whom created them) as done when
  //    their source action item has been removed from the latest snapshot.
  const todosToAutoDone = existingWithSources.filter(
    ({
      todo,
      sourceConversationId,
      conversationTodoVersionedActionItemSId,
    }) => {
      if (todo.status === "done") {
        return false;
      }
      if (
        sourceConversationId === null ||
        conversationTodoVersionedActionItemSId === null
      ) {
        return false;
      }
      const activeItems =
        activeItemSIdsByConversation.get(sourceConversationId);
      // Conversation not in this space -- skip.
      if (activeItems === undefined) {
        return false;
      }
      return !activeItems.has(conversationTodoVersionedActionItemSId);
    }
  );

  await concurrentExecutor(
    todosToAutoDone,
    async ({ todo }) => {
      await todo.createVersion(auth, {
        status: "done",
        doneAt: new Date(),
        markedAsDoneByType: "agent",
        markedAsDoneByAgentConfigurationId: PROJECT_TODO_AGENT_CONFIGURATION_ID,
      });
    },
    { concurrency: MERGE_CONCURRENCY }
  );
}
