export type InternalErrorWithStatusCode = {
  status_code: number;
};

export type APIErrorType =
  | "missing_authorization_header_error"
  | "malformed_authorization_header_error"
  | "invalid_api_key_error"
  | "internal_server_error"
  | "data_source_not_found"
  | "invalid_request_error"
  | "data_source_error"
  | "user_not_found"
  | "data_source_user_mismatch_error"
  | "data_source_quota_error"
  | "data_source_document_not_found"
  | "app_user_mismatch_error"
  | "run_error"
  | "app_not_found"
  | "method_not_supported_error"
  | "personal_workspace_not_found";

type _APIError = {
  type: APIErrorType;
  message: string;
  data_source_error?: object;
  run_error?: object;
};

/**
 * Error structure returned by our public API endpoints (api/v1/*)
 */
export type APIError = {
  error: _APIError;
};

/**
 * Type to transport a HTTP error with its http status code (eg: 404)
 * and the error object returned by our public API endpoints (api/v1/*)
 */
export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};
