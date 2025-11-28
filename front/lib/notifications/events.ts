export const CONVERSATIONS_UPDATED_EVENT = "conversations-updated";

export class ConversationsUpdatedEvent extends CustomEvent<void> {
  constructor() {
    super(CONVERSATIONS_UPDATED_EVENT);
  }
}
