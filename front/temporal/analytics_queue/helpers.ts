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

// Deterministic, one per workspace and export cache key (see buildConsumptionExportCacheKey):
// requests for the same period+filter dedupe onto the same workflow, while requests for a
// different period+filter get their own workflow and can run concurrently.
export function makeConsumptionExportWorkflowId({
  workspaceId,
  exportId,
}: {
  workspaceId: string;
  exportId: string;
}): string {
  return `consumption-export-${workspaceId}-${exportId}`;
}
