export type DustErrorCode =
  | "resource_not_found"
  | "unauthorized"
  | "invalid_id"
  | "core_api_error"
  // Data source
  | "data_source_quota_error"
  | "text_or_section_required"
  | "invalid_url"
  // Group errors
  | "user_not_found"
  | "user_not_member"
  | "user_already_member"
  | "system_or_global_group";

export class DustError extends Error {
  constructor(
    readonly code: DustErrorCode,
    message: string
  ) {
    super(message);
  }
}
