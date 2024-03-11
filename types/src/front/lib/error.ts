import { ConnectorsAPIError } from "../../connectors/api";
import { CoreAPIError } from "./core_api";

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
  | "provider_auth_error"
  | "provider_not_found"
  | "dataset_not_found"
  | "workspace_not_found"
  | "workspace_auth_error"
  | "workspace_user_not_found"
  | "method_not_supported_error"
  | "personal_workspace_not_found"
  | "workspace_not_found"
  | "action_unknown_error"
  | "action_api_error"
  | "membership_not_found"
  | "invitation_not_found"
  | "plan_limit_error"
  | "template_not_found"
  | "chat_message_not_found"
  | "event_schema_not_found"
  | "extracted_event_not_found"
  | "connector_not_found_error"
  | "connector_update_error"
  | "connector_update_unauthorized"
  | "connector_oauth_target_mismatch"
  | "conversation_not_found"
  | "agent_configuration_not_found"
  | "message_not_found"
  | "test_plan_message_limit_reached"
  | "global_agent_error"
  | "stripe_invalid_product_id_error"
  | "rate_limit_error"
  | "subscription_payment_failed"
  // Used in the DustAPI client:
  | "unexpected_error_format"
  | "unexpected_response_format"
  // Used by callAction client:
  | "action_failed"
  | "unexpected_action_response"
  | "feature_flag_not_found"
  | "feature_flag_already_exists"
  | "table_not_found";

export type APIError = {
  type: APIErrorType;
  message: string;
  data_source_error?: CoreAPIError;
  run_error?: CoreAPIError;
  app_error?: CoreAPIError;
  connectors_error?: ConnectorsAPIError;
};

export function isAPIError(obj: unknown): obj is APIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "type" in obj &&
    typeof obj.type === "string"
    // TODO(spolu): check type is a valid APIErrorType
  );
}

/**
 * Type to transport a HTTP error with its http status code (eg: 404)
 * and the error object returned by our public API endpoints (api/v1/*)
 */
export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};

export type APIErrorResponse = {
  error: APIError;
};

export type WithAPIErrorReponse<T> = T | APIErrorResponse;
