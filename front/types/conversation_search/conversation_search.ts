import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";

/**
 * Elasticsearch document for conversation listing.
 *
 * Stores only the fields needed for filtering and ordering. Per-user mutable
 * state (actionRequired, unread) is hydrated from the DB after the ES query
 * returns the ordered set of IDs.
 */
export interface ConversationSearchDocument extends ElasticsearchBaseDocument {
  conversation_id: string;
  created_at: string;
  participants: Array<{
    user_id: string;
  }>;
  requested_space_ids: string[];
  space_id?: string;
  updated_at: string;
  visibility: string;
}
