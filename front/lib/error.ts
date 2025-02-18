export type DustErrorCode =
  | "resource_not_found"
  | "unauthorized"
  | "invalid_id"
  | "core_api_error"
  | "internal_error"
  | "limit_reached"
  // Data source
  | "data_source_error"
  | "data_source_quota_error"
  | "text_or_section_required"
  | "invalid_url"
  | "invalid_parents"
  | "invalid_parent_id"
  | "invalid_title_in_tags"
  // Table
  | "missing_csv"
  | "invalid_rows"
  // Group errors
  | "user_not_found"
  | "user_not_member"
  | "user_already_member"
  | "system_or_global_group"
  // Space errors
  | "space_already_exists";

export class DustError extends Error {
  constructor(
    readonly code: DustErrorCode,
    message: string
  ) {
    super(message);
  }
}
