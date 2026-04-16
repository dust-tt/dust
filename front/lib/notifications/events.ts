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

export const COMPACTION_STARTED_EVENT = "compaction-started";

export class CompactionStartedEvent extends CustomEvent<{
  conversationId: string;
}> {
  constructor(conversationId: string) {
    super(COMPACTION_STARTED_EVENT, {
      detail: { conversationId },
    });
  }
}

export const COMPACTION_COMPLETED_EVENT = "compaction-completed";

export class CompactionCompletedEvent extends CustomEvent<void> {
  constructor() {
    super(COMPACTION_COMPLETED_EVENT);
  }
}
