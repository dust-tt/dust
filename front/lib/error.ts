export type DustErrorCode =
  | "core_api_error"
  | "internal_error"
  | "invalid_id"
  | "limit_reached"
  | "connection_not_found"
  | "file_not_found"
  | "unauthorized"
  | "agent_loop_already_running"
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
  | "invalid_file"
  | "file_not_ready"
  // Table
  | "invalid_rows"
  | "missing_csv"
  | "invalid_csv_content"
  | "invalid_csv_and_file"
  | "invalid_content_error"
  | "table_not_found"
  // Group errors
  | "system_or_global_group"
  | "user_already_member"
  | "user_not_found"
  | "user_not_member"
  | "group_not_found"
  // MCP Server errors
  | "remote_server_not_found"
  | "internal_server_not_found"
  | "mcp_server_view_not_found"
  | "action_not_found"
  | "action_not_blocked"
  // Triggers errors
  | "webhook_source_not_found"
  // Space errors
  | "space_already_exists";

export class DustError<T extends DustErrorCode = DustErrorCode> extends Error {
  constructor(
    readonly code: T,
    message: string
  ) {
    super(message);
  }
}
