export function makeTrackProgrammaticUsageWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): string {
  return `usage-tracking-${workspaceId}-${conversationId}-${agentMessageId}`;
}
