export function makeConversationForkWorkflowId({
  workspaceId,
  destConversationId,
}: {
  workspaceId: string;
  destConversationId: string;
}): string {
  return `conversation-fork-${workspaceId}-${destConversationId}`;
}
