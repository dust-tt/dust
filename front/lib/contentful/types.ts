import type { Asset, EntrySkeletonType } from "contentful";

/**
 * Contentful content type: `conversationDraft`
 *
 * Fields:
 * - slug (Symbol, required, unique, exactly 4 chars)
 * - title (Symbol, required, unique)
 * - prompt (Long text, required)
 * - attachments (Array of Asset links, optional, max 8)
 */
export interface ConversationDraftFields {
  slug: string;
  title: string;
  prompt: string;
  attachments?: Asset[];
}

export type ConversationDraftSkeleton = EntrySkeletonType<
  ConversationDraftFields,
  "conversationDraft"
>;

export interface ConversationDraftAttachment {
  url: string;
  fileName: string;
  contentType: string | null;
}

export interface ConversationDraft {
  slug: string;
  title: string;
  prompt: string;
  attachments: ConversationDraftAttachment[];
}
