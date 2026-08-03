export type TopConversationCreditsRow = {
  conversationId: string;
  title: string | null;
  totalCredits: number;
};

export type GetMyTopConversationsResponseBody = {
  conversations: TopConversationCreditsRow[];
};
