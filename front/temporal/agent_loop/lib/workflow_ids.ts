import type { AuthenticatorType } from "@app/lib/auth";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export function makeAgentLoopWorkflowId({
  workspaceId,
  conversationId,
  agentMessageId,
}: {
  workspaceId: string;
  conversationId: string;
  agentMessageId: string;
}) {
  return `agent-loop-workflow-${workspaceId}-${conversationId}-${agentMessageId}`;
}

export function makeScheduledAgentLoopWorkflowId({
  workspaceId,
  conversationId,
  agentMessageId,
  scheduledFor,
}: {
  workspaceId: string;
  conversationId: string;
  agentMessageId: string;
  scheduledFor: Date;
}) {
  return (
    makeAgentLoopWorkflowId({ workspaceId, conversationId, agentMessageId }) +
    `-${scheduledFor.toISOString()}`
  );
}

export function makeAgentLoopConversationTitleWorkflowId(
  authType: AuthenticatorType,
  runAgentArgs: AgentLoopArgs
) {
  const { workspaceId } = authType;
  const { conversationId } = runAgentArgs;

  return `agent-loop-conversation-title-workflow-${workspaceId}-${conversationId}`;
}
