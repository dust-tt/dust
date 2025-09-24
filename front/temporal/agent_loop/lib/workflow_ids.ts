import type { AuthenticatorType } from "@app/lib/auth";
import type { RunAgentAsynchronousArgs } from "@app/types/assistant/agent_run";

export function makeAgentLoopWorkflowId(args: {
  workspaceId: string; // must be non-null workspace sId
  conversationId: string;
  agentMessageId: string;
}) {
  const { workspaceId, conversationId, agentMessageId } = args;
  return `agent-loop-workflow-${workspaceId}-${conversationId}-${agentMessageId}`;
}

export function makeAgentLoopConversationTitleWorkflowId(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentAsynchronousArgs
) {
  const { workspaceId } = authType;
  const { conversationId } = runAgentArgs;

  return `agent-loop-conversation-title-workflow-${workspaceId}-${conversationId}`;
}
