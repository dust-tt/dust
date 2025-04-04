export type AgentMessageFeedbackType = {
  messageId: string;
  agentMessageId: number;
  userId: number;
  thumbDirection: AgentMessageFeedbackDirection;
  content: string | null;
  createdAt: number;
  agentConfigurationId: string;
  agentConfigurationVersion: number;
  isConversationShared: boolean;
};

export type AgentMessageFeedbackDirection = "up" | "down";
