export function makeConversationUnreadNotificationWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): string {
  return `conversation-unread-notification-${workspaceId}-${conversationId}-${agentMessageId}`;
}
