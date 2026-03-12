export const CONVERSATIONS_UPDATED_EVENT = "conversations-updated";

export class ConversationsUpdatedEvent extends CustomEvent<void> {
  constructor() {
    super(CONVERSATIONS_UPDATED_EVENT);
  }
}

export const AGENT_MESSAGE_COMPLETED_EVENT = "agent-message-completed";

export class AgentMessageCompletedEvent extends CustomEvent<void> {
  constructor() {
    super(AGENT_MESSAGE_COMPLETED_EVENT);
  }
}

export const CONVERSATION_ATTACHMENTS_UPDATED_EVENT =
  "conversation-attachments-updated";

export class ConversationAttachmentsUpdatedEvent extends CustomEvent<void> {
  constructor() {
    super(CONVERSATION_ATTACHMENTS_UPDATED_EVENT);
  }
}
