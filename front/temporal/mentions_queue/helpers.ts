export function makeMentionsWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): string {
  return `mentions-${workspaceId}-${conversationId}-${agentMessageId}`;
}
