import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

export type SearchConversationsResponseBody = {
  conversations: Array<
    ConversationWithoutContentType & { spaceName: string | null }
  >;
  hasMore: boolean;
  lastValue: string | null;
};
