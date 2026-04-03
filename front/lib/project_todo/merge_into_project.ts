// TODO: implement "merge".
//
// This module will merge the latest conversation_todo_versioned snapshots for all
// conversations in a project into project_todo rows. It is called by
// mergeTodosForProjectActivity, which itself is invoked by the per-project
// projectMergeWorkflow at most once per MERGE_THROTTLE_MS (1 hour by default).
//
// High-level algorithm (to be implemented):
//
//   1. Fetch all ConversationTodoVersioned snapshots (latest per conversation) for
//      conversations that belong to the given spaceId.
//   2. For each item (actionItem / keyDecision / notableFact):
//        - Resolve target users (assigneeUserId, relevantUserIds, or conversation participants).
//        - For each target user, look up existing agent-created ProjectTodo via
//          ProjectTodoResource.fetchByConversationSource(auth, {
//            sourceConversationModelId, conversationTodoItemSId, userId
//          }).
//        - not found  → ProjectTodoResource.makeNew() + addSource({ conversationTodoItemSId })
//        - found, changed  → existing.createVersion()
//        - found, unchanged → skip
//   3. For each agent-created ProjectTodo whose conversationTodoItemSId is absent from
//      the latest snapshot → createVersion({ status: "done", markedAsDoneByType: "agent" }).
//
// Category mapping:
//   actionItems  (open)    → "follow_ups",      status: "todo"
//   actionItems  (done)    → "follow_ups",      status: "done"
//   keyDecisions (open)    → "key_decisions",   status: "todo"
//   keyDecisions (decided) → "key_decisions",   status: "done"
//   notableFacts           → "notable_updates", status: "todo"

import type { Authenticator } from "@app/lib/auth";

export async function mergeConversationTodosIntoProject(
  _auth: Authenticator,
  { spaceId }: { spaceId: string }
): Promise<void> {
  void spaceId;
}
