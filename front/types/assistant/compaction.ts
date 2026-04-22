export type CompactionAttachmentIdReplacements = Record<string, string>;

export type CompactionSourceConversation = {
  conversationId: string;
  messageRank: number;
  attachmentIdReplacements?: CompactionAttachmentIdReplacements;
};
