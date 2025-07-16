export function getAgentExecutionChannelId(agentMessageId: string) {
  return `agent-execution-${agentMessageId}`;
}

export function getConversationChannelId({
  conversationId,
}: {
  conversationId: string;
}) {
  return `conversation-${conversationId}`;
}
