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

export function makeMetronomeUsageEventsWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): string {
  return `metronome-usage-${workspaceId}-${conversationId}-${agentMessageId}`;
}

export function makeMetronomeSeatCountSyncWorkflowId({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `metronome-seat-count-sync-${workspaceId}`;
}

export function makeReconcileApiKeyCreditStateWorkflowId({
  workspaceId,
  keyId,
}: {
  workspaceId: string;
  keyId: number;
}): string {
  return `metronome-api-key-cap-reconcile-${workspaceId}-${keyId}`;
}
