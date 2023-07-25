import { ConnectorsAPIErrorResponse } from "./connectors_api";
import { CoreAPIErrorResponse } from "./core_api";

export type InternalErrorWithStatusCode = {
  status_code: number;
};

export type APIErrorType =
  | "missing_authorization_header_error"
  | "malformed_authorization_header_error"
  | "invalid_api_key_error"
  | "internal_server_error"
  | "invalid_request_error"
  | "user_not_found"
  | "data_source_error"
  | "data_source_not_found"
  | "data_source_auth_error"
  | "data_source_quota_error"
  | "data_source_document_not_found"
  | "data_source_not_managed"
  | "run_error"
  | "app_not_found"
  | "app_auth_error"
  | "dataset_not_found"
  | "workspace_not_found"
  | "workspace_auth_error"
  | "workspace_user_not_found"
  | "method_not_supported_error"
  | "personal_workspace_not_found"
  | "workspace_not_found"
  | "action_unknown_error"
  | "action_api_error"
  | "invitation_not_found"
  | "plan_limit_error"
  | "chat_session_not_found"
  | "chat_message_not_found"
  | "chat_session_auth_error"
  | "template_not_found"
  | "chat_message_not_found"
  | "event_schema_not_found"
  | "extracted_event_not_found"
  | "extracted_event_auth_error";

export type APIError = {
  type: APIErrorType;
  message: string;
  data_source_error?: CoreAPIErrorResponse;
  run_error?: CoreAPIErrorResponse;
  app_error?: CoreAPIErrorResponse;
  connectors_error?: ConnectorsAPIErrorResponse;
};

export type ReturnedAPIErrorType = {
  error: APIError;
};

/**
 * Type to transport a HTTP error with its http status code (eg: 404)
 * and the error object returned by our public API endpoints (api/v1/*)
 */
export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};
