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
