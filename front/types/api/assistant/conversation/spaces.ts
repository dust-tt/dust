// Shared contract types for the assistant conversation "spaces" API endpoints.
import type {
  ConversationWithoutContentType,
  LightConversationType,
} from "@app/types/assistant/conversation";
import type { PodListItemType } from "@app/types/space";

export type GetBySpacesSummaryResponseBody = {
  summary: Array<{
    space: PodListItemType;
    unreadConversations: ConversationWithoutContentType[];
    nonParticipantUnreadConversations: ConversationWithoutContentType[];
  }>;
};

export type GetSpaceConversationsResponseBody = {
  conversations: LightConversationType[];
  hasMore: boolean;
  lastValue: string | null;
  isEmpty: boolean;
};

export type GetSpaceUnreadConversationsResponseBody = {
  unreadConversationIds: string[];
};
