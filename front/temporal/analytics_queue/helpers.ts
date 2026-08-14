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

// Deterministic, one per workspace
export function makeConsumptionExportWorkflowId({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `consumption-export-${workspaceId}`;
}
