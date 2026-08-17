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

// Shared by makeConsumptionExportWorkflowId and by callers that need to match any export
// workflow for a workspace regardless of its cache key (e.g. a WorkflowId STARTS_WITH query).
export function makeConsumptionExportWorkflowIdPrefix({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `consumption-export-${workspaceId}-`;
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
  return `${makeConsumptionExportWorkflowIdPrefix({ workspaceId })}${exportId}`;
}
