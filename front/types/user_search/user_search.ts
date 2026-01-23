import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";

/**
 * Elasticsearch document for user search.
 * Enables searching users by email and full name.
 */
export interface UserSearchDocument extends ElasticsearchBaseDocument {
  user_id: string; // User's unique identifier (sId)
  email: string; // User's email address
  full_name: string; // User's full name
  updated_at: Date; // Date when document was created/updated
}
