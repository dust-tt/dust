// Okay to use public API types because it's front/connectors communication.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { ConnectorsAPIError } from "@dust-tt/client";

import { CONVERSATION_ERROR_TYPES } from "@app/types/assistant/conversation";
import type { CoreAPIError } from "@app/types/core/core_api";

export type InternalErrorWithStatusCode = {
  status_code: number;
};

const API_ERROR_TYPES = [
  "not_authenticated",
  "sso_enforced",
  "missing_authorization_header_error",
  "malformed_authorization_header_error",
  "invalid_basic_authorization_error",
  "invalid_oauth_token_error",
  "expired_oauth_token_error",
  "invalid_api_key_error",
  "internal_server_error",
  "invalid_request_error",
  "invalid_rows_request_error",
  "user_not_found",
  "content_too_large",
  "data_source_error",
  "data_source_not_found",
  "data_source_view_not_found",
  "data_source_auth_error",
  "data_source_quota_error",
  "workspace_quota_error",
  "data_source_document_not_found",
  "data_source_not_managed",
  "run_error",
  "app_not_found",
  "app_auth_error",
  "provider_auth_error",
  "provider_not_found",
  "dataset_not_found",
  "workspace_not_found",
  "workspace_auth_error",
  "workspace_can_use_product_required_error",
  "workspace_user_not_found",
  "method_not_supported_error",
  "personal_workspace_not_found",
  "action_unknown_error",
  "action_api_error",
  "membership_not_found",
  "invitation_not_found",
  "plan_limit_error",
  "template_not_found",
  "chat_message_not_found",
  "connector_not_found_error",
  "connector_update_error",
  "connector_update_unauthorized",
  "connector_oauth_target_mismatch",
  "connector_oauth_user_missing_rights",
  "connector_provider_not_supported",
  "connector_credentials_error",
  "connector_operation_in_progress",
  "agent_configuration_not_found",
  "agent_group_permission_error",
  "agent_message_error",
  "message_not_found",
  "plan_message_limit_exceeded",
  "global_agent_error",
  "stripe_invalid_product_id_error",
  "rate_limit_error",
  "subscription_payment_failed",
  "subscription_not_found",
  "subscription_state_invalid",
  "service_unavailable",
  // Use by agent creation / update
  "assistant_saving_error",
  // Used in the DustAPI client:
  "unexpected_error_format",
  "unexpected_response_format",
  "unexpected_network_error",
  // Used by callAction client:
  "action_failed",
  "unexpected_action_response",
  "feature_flag_not_found",
  "feature_flag_already_exists",
  // Pagination:
  "invalid_pagination_parameters",
  "table_not_found",
  // Templates:
  "template_not_found",
  // Invitations:
  "invitation_already_sent_recently",
  // DustAppSecrets:
  "dust_app_secret_not_found",
  // Key:
  "key_not_found",
  // Labs:
  "transcripts_configuration_not_found",
  "transcripts_configuration_default_not_allowed",
  "transcripts_configuration_already_exists",
  // Files:
  "file_not_found",
  "file_too_large",
  "file_type_not_supported",
  "file_is_empty",
  // Runs:
  "run_not_found",
  // Spaces:
  "space_already_exists",
  "space_not_found",
  // Groups:
  "group_not_found",
  // Plugins:
  "plugin_not_found",
  "plugin_execution_failed",
  // Trackers:
  "tracker_not_found",
  // Triggers:
  "trigger_not_found",
  "webhook_source_not_found",
  "webhook_source_view_auth_error",
  "webhook_source_auth_error",
  "webhook_source_view_not_found",
  "webhook_source_misconfiguration",
  // MCP Server Connections:
  "mcp_server_connection_not_found",
  "mcp_server_view_not_found",
  "action_not_found",
  "action_not_blocked",
  // Conversation:
  ...CONVERSATION_ERROR_TYPES,
  // MCP:
  "mcp_auth_error",
  "invalid_mcp_server_id",
  "mcp_server_not_found",
  // Workos:
  "workos_organization_not_found",
  "workos_server_error",
  "workos_multiple_sso_connections_not_supported",
  "workos_multiple_directories_not_supported",
  "user_authentication_required",
  "agent_memory_not_found",
] as const;

export type APIErrorType = (typeof API_ERROR_TYPES)[number];

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
    typeof obj.type === "string" &&
    API_ERROR_TYPES.includes(obj.type as APIErrorType)
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

export function isAPIErrorResponse(obj: unknown): obj is APIErrorResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "error" in obj &&
    isAPIError(obj.error)
  );
}

export type WithAPIErrorResponse<T> = T | APIErrorResponse;
