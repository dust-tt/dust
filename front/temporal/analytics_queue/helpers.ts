export function makeAgentMessageAnalyticsWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
  executionKey,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
  executionKey?: string;
}): string {
  return `agent-message-analytics-${workspaceId}-${conversationId}-${agentMessageId}${executionKey ? `-${executionKey}` : ""}`;
}
