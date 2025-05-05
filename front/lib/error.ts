export type DustErrorCode =
  | "core_api_error"
  | "internal_error"
  | "invalid_id"
  | "limit_reached"
  | "resource_not_found"
  | "unauthorized"
  // Data source
  | "data_source_error"
  | "data_source_quota_error"
  | "invalid_parent_id"
  | "invalid_parents"
  | "invalid_title_in_tags"
  | "invalid_url"
  | "text_or_section_required"
  | "title_is_empty"
  | "title_too_long"
  // Table
  | "invalid_rows"
  | "missing_csv"
  // Group errors
  | "system_or_global_group"
  | "user_already_member"
  | "user_not_found"
  | "user_not_member"
  | "group_not_found"
  // MCP Server errors
  | "remote_server_not_found"
  | "internal_server_not_found"
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
