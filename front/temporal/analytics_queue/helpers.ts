export function makeAgentMessageAnalyticsWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): string {
  return `agent-message-analytics-${workspaceId}-${conversationId}-${agentMessageId}`;
}
