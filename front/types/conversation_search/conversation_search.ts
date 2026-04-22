import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";

/**
 * Elasticsearch document for conversation listing.
 *
 * Stores all fields needed to build a ConversationListItemType without any DB
 * round-trip. Per-user state (actionRequired, lastReadMs) lives in the nested
 * participants array and is retrieved per-user via inner_hits.
 */
export interface ConversationSearchDocument extends ElasticsearchBaseDocument {
  conversation_id: string;
  created_at: string;
  has_error: boolean;
  metadata: Record<string, unknown>;
  participants: Array<{
    action_required: boolean;
    last_read_at: string | null;
    user_id: string;
  }>;
  requested_space_ids: string[];
  space_id?: string;
  title: string | null;
  trigger_id: string | null;
  updated_at: string;
  visibility: string;
}
