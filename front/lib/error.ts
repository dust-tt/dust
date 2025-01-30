const DUST_ERROR_CODES = [
  "resource_not_found",
  "unauthorized",
  "invalid_id",
  "core_api_error",
  "internal_error",
  "limit_reached",
  // Data source
  "data_source_error",
  "data_source_quota_error",
  "text_or_section_required",
  "invalid_url",
  "invalid_parents",
  "invalid_parent_id",
  // Table
  "malformed_csv",
  "missing_csv",
  "invalid_rows",
  // Group errors
  "user_not_found",
  "user_not_member",
  "user_already_member",
  // Space errors
  "system_or_global_group",
  "space_already_exists",
] as const;

export type DustErrorCode = (typeof DUST_ERROR_CODES)[number];

export type DustError = {
  name: "dust_error";
  code: DustErrorCode;
  message: string;
}

export function isDustError(err: unknown): err is DustError {
  return (
    !!err && typeof err === 'object' &&
    'name' in err && err.name === 'dust_error' &&
    'code' in err && typeof err.code === 'string' &&
    (DUST_ERROR_CODES as readonly string[]).includes(err.code) &&
    'message' in err && typeof err.message === 'string'
  );
}