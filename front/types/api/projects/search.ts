import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

export type SearchConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};
