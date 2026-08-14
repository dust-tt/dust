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

// Deterministic, one per workspace: this is what keeps at most one consumption export
// running per workspace at a time (a duplicate `start()` call fails with
// `WorkflowExecutionAlreadyStartedError` instead of launching a second run).
export function makeConsumptionExportWorkflowId({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `consumption-export-${workspaceId}`;
}
