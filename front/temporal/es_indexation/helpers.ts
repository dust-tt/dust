export function makeIndexUserSearchWorkflowId({
  userId,
}: {
  userId: string;
}): string {
  return `es-indexation-user-search-${userId}`;
}

export function makeIndexConversationEsWorkflowId({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `es-indexation-conversation-${workspaceId}-${conversationId}`;
}
