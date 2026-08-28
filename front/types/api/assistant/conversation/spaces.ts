// Shared contract types for the assistant conversation "spaces" API endpoints.
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { PodListItemType } from "@app/types/space";

export type GetBySpacesSummaryResponseBody = {
  summary: Array<{
    space: PodListItemType;
    unreadConversations: ConversationWithoutContentType[];
    nonParticipantUnreadConversationIds: string[];
    // Always empty: kept so old clients that still read this field do not break.
    nonParticipantUnreadConversations: [];
  }>;
};

export type PodConversationListItemType = {
  id: string;
  title: string;
  created: number;
  updated: number;
  replyCount: number;
  unreadMessageCount: number;
  isRunningAgentLoop: boolean;
  isParticipant: boolean;
  description: string;
  creator: {
    name: string;
    visual: string;
    isRounded: boolean;
  } | null;
  avatars: {
    name: string;
    visual: string;
    isRounded: boolean;
  }[];
};

export type GetSpaceConversationsResponseBody = {
  conversations: PodConversationListItemType[];
  hasMore: boolean;
  lastValue: string | null;
  isEmpty: boolean;
};

export type GetSpaceUnreadConversationsResponseBody = {
  unreadConversationIds: string[];
};
