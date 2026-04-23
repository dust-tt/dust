import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";

/**
 * Elasticsearch document for conversation listing.
 *
 * Stores stable shared fields only. Volatile per-user state (lastReadMs, unread)
 * is hydrated from DB after the ES page is returned.
 */
export interface ConversationSearchDocument extends ElasticsearchBaseDocument {
  conversation_id: string;
  created_at: string;
  has_error: boolean;
  metadata: Record<string, unknown>;
  participants: Array<{
    action_required: boolean;
    user_id: string;
  }>;
  requested_space_ids: string[];
  space_id?: string;
  title: string | null;
  trigger_id: string | null;
  updated_at: string;
  visibility: string;
}
