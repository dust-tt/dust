import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type { MembershipSeatType } from "@app/types/memberships";

/**
 * Elasticsearch document for user search.
 * Enables searching users by email and full name.
 */
export interface UserSearchDocument extends ElasticsearchBaseDocument {
  user_id: string; // User's unique identifier (sId)
  email: string; // User's email address
  full_name: string; // User's full name
  // The user's currently-active seat type in this workspace (denormalized from
  // the memberships table) so seat-type filtering can be owned by the search
  // index. Mirrors the active membership shown in the members table.
  seat_type: MembershipSeatType;
  updated_at: Date; // Date when document was created/updated
}
