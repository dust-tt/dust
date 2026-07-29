// `runKey` scopes the workflow to a single agent-loop execution. A message that
// spans several executions (interrupt / resume / permission pause) finalizes
// once per execution, each launching this workflow; without a per-execution
// discriminator every launch after the first collides on the workflow id and is
// dropped as `WorkflowExecutionAlreadyStarted`, so only the first execution's
// usage is ever reported. Retries of the *same* execution reuse the same
// `runKey` (deterministic from its `dustRunIds`), so they still dedup.
export function makeTrackProgrammaticUsageWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
  runKey,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
  runKey: string;
}): string {
  return `usage-tracking-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}`;
}

export function makeMetronomeUsageEventsWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
  runKey,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
  runKey: string;
}): string {
  return `metronome-usage-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}`;
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
