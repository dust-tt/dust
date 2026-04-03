import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { analyzeConversationTodos } from "@app/lib/project_todo/analyze_conversation";
import { mergeConversationTodosIntoProject } from "@app/lib/project_todo/merge_into_project";
import logger from "@app/logger/logger";
import { signalOrStartProjectMergeWorkflow } from "@app/temporal/project_todo/client";
import { Context } from "@temporalio/activity";

export async function analyzeProjectTodosActivity({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { conversationId, error: authResult.error },
      "Conversation todo: failed to deserialize authenticator"
    );
    return;
  }
  const auth = authResult.value;

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    logger.warn(
      { conversationId, error: conversationRes.error },
      "Conversation todo: conversation not found, skipping"
    );
    return;
  }

  const conversation = conversationRes.value;

  // Skip very short conversations.
  if (conversation.content.length < 2) {
    return;
  }

  const { runId } = Context.current().info.workflowExecution;
  await analyzeConversationTodos(auth, { conversation, messageId, runId });
}

// Called by projectTodoWorkflow after a successful analysis run. Uses signalWithStart
// so the merge workflow is automatically created if not already running.
export async function signalOrStartMergeWorkflowActivity({
  authType,
  spaceId,
}: {
  authType: AuthenticatorType;
  spaceId: string;
}): Promise<void> {
  await signalOrStartProjectMergeWorkflow({ authType, spaceId });
}

// Called by projectMergeWorkflow. Merges the latest conversation_todo_versioned snapshots
// for all conversations in the project into project_todo rows.
export async function mergeTodosForProjectActivity({
  authType,
  spaceId,
}: {
  authType: AuthenticatorType;
  spaceId: string;
}): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { spaceId, error: authResult.error },
      "Project todo merge: failed to deserialize authenticator"
    );
    return;
  }

  const auth = authResult.value;

  logger.info(
    { spaceId, workspaceId: auth.getNonNullableWorkspace().sId },
    "Project todo merge: activity invoked (not yet implemented)"
  );

  await mergeConversationTodosIntoProject(auth, { spaceSId: spaceId });
}
