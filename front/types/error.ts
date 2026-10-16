// Okay to use public API types because it's front/connectors communication.

import { CONVERSATION_ERROR_TYPES } from "@app/types/assistant/conversation";
import type { CoreAPIError } from "@app/types/core/core_api";
// oxlint-disable-next-line dust/enforceClientTypesInPublicApi -- existing usage
import type { ConnectorsAPIError } from "@dust-tt/client";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { CellInfo } from "./cell";

/**
 * @cc [owner:Nils-Fedrigo,label:api;error-handling] invalid-request-error-means-malformed
 * `invalid_request_error` MUST only describe a request that does not match the shape the endpoint
 * accepts: a body, query, path parameter or header that fails schema validation, a missing required
 * field, or an unparsable payload. A failure that depends on server-side state (a missing resource,
 * a permission, a feature flag, a plan, the state of a resource, a name conflict, a limit) or on
 * a value the user typed MUST use a dedicated type naming that failure instead.
 */
const API_ERROR_TYPES = [
  "not_authenticated",
  "sso_enforced",
  "missing_authorization_header_error",
  "malformed_authorization_header_error",
  "invalid_basic_authorization_error",
  "invalid_oauth_token_error",
  "expired_oauth_token_error",
  "invalid_api_key_error",
  "invalid_sandbox_token_error",
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
  "provider_endpoint_error",
  "dataset_not_found",
  "workspace_not_found",
  "workspace_in_different_cell",
  "workspace_auth_error",
  "workspace_can_use_product_required_error",
  "workspace_user_not_found",
  "method_not_supported_error",
  "personal_workspace_not_found",
  "action_unknown_error",
  "action_api_error",
  "membership_not_found",
  "membership_revoked",
  "invitation_not_found",
  "plan_limit_error",
  "template_not_found",
  "chat_message_not_found",
  "connector_not_found_error",
  "connector_update_error",
  "connector_update_unauthorized",
  "connector_oauth_connection_not_found",
  "connector_oauth_target_mismatch",
  "connector_oauth_user_missing_rights",
  "connector_oauth_user_must_be_admin",
  "connector_provider_not_supported",
  "connector_credentials_error",
  "connector_credentials_not_found",
  "connector_operation_in_progress",
  "agent_configuration_not_found",
  "agent_inaccessible",
  "agent_group_permission_error",
  "agent_message_error",
  "unprocessable_entity",
  "message_not_found",
  "plan_message_limit_exceeded",
  "credits_exhausted",
  "user_cap_reached",
  "group_shared_usage_limit_reached",
  "no_seat",
  "model_disabled",
  "global_agent_error",
  "stripe_invalid_product_id_error",
  "rate_limit_error",
  "subscription_payment_failed",
  "subscription_not_found",
  "subscription_state_invalid",
  "trial_restriction",
  "service_unavailable",
  // Gating:
  "feature_not_enabled",
  "project_space_required",
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
  "insufficient_key_scope",
  "admin_key_analytics_groups_not_allowed",
  "analytics_group_kind_not_supported",
  // Labs:
  "transcripts_configuration_not_found",
  "transcripts_configuration_default_not_allowed",
  "transcripts_configuration_already_exists",
  // Files:
  "file_not_found",
  "file_too_large",
  "file_type_not_supported",
  "file_is_empty",
  "file_read_only",
  "collab_session_conflict",
  "collab_session_write_refused",
  // Runs:
  "run_not_found",
  // Spaces:
  "space_already_exists",
  "space_not_found",
  // Project todos:
  "project_task_not_found",
  // Groups:
  "group_not_found",
  "shared_usage_limit_order_changed",
  "invalid_shared_usage_limit_order",
  // Coupons:
  "coupon_not_found",
  "coupon_not_redeemable",
  "coupon_already_redeemed",
  // Plugins:
  "plugin_not_found",
  "plugin_execution_failed",
  // Action recommendations:
  "recommendation_not_found",
  // Activation work areas:
  "activation_work_area_not_found",
  // Triggers:
  "trigger_not_found",
  "webhook_source_not_found",
  "webhook_source_view_auth_error",
  "webhook_source_auth_error",
  "webhook_source_view_not_found",
  "webhook_source_view_triggering_agent",
  "webhook_source_misconfiguration",
  "webhook_processing_error",
  "webhook_storage_error",
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
  // ES
  "elasticsearch_error",
  // Skills
  "skill_not_found",
  "skill_github_repository_not_found",
  "sandbox_function_not_found",
  "sandbox_function_invocation_not_found",
  "frame_runtime_unavailable",
  "frame_manifest_not_movable",
  "fast_function_called_tools",
  // Projects
  "project_metadata_not_found",
  // Suggestions
  "agent_suggestion_not_found",
  "batch_suggestion_not_found",
  // Wake-ups
  "wakeup_not_found",
  "conversation_locked",
  "open_pods_disabled",
  "space_group_kind_not_supported",
  "global_space_cannot_be_restricted",
  "global_space_not_renamable",
  "space_in_use",
  "already_pod_member",
  "user_already_space_member",
  "system_group_members_not_editable",
  "space_kind_has_no_members",
  "data_source_provider_not_allowed_in_space",
  "embedding_api_key_missing",
  "data_source_already_exists",
  "data_source_name_not_allowed",
  "connector_creation_failed",
  "managed_data_source_not_editable",
  "data_source_not_deletable",
  "data_source_view_already_exists",
  "search_query_too_short",
  "no_searchable_space",
  "app_name_invalid",
  "dataset_already_exists",
  "dataset_name_invalid",
  "dataset_data_invalid",
  "pod_file_tab_limit_exceeded",
  "pod_file_tab_not_previewable",
  "assignee_not_pod_member",
  "pod_tasks_already_seeded",
  "notion_connector_required",
  "google_drive_connection_not_found",
  "project_task_not_startable",
  "data_source_file_use_case_not_supported",
  "data_source_file_not_ready",
  "table_file_content_invalid",
  "node_title_too_long",
  "app_in_use",
  "message_type_not_supported",
  "message_author_required",
  "mention_not_found",
  "mention_user_not_added_to_pod",
  "conversation_busy",
  "conversation_compaction_running",
  "conversation_already_compacted",
  "conversation_fork_pending",
  "multiple_agent_mentions",
  "model_not_supported",
  "fork_source_message_not_found",
  "conversation_move_not_supported",
  "space_selection_not_supported_in_pod",
  "space_not_selectable",
  "mcp_server_restricted_to_skills",
  "mcp_server_access_denied",
  "action_not_editable",
  "agent_message_not_resumable",
  "invalid_webhook_signature",
  "file_not_attachable",
  "file_not_ready",
  "content_node_not_found",
  "attachment_space_not_allowed",
  "content_fragment_not_found",
  "agent_archived",
  "active_custom_agent_required",
  "agent_already_exists",
  "agent_already_created",
  "agent_modified_concurrently",
  "agent_editor_required",
  "user_already_agent_editor",
  "user_not_agent_editor",
  "editor_not_workspace_member",
  "conflicting_suggestions",
  "agent_suggestion_not_applicable",
  "agent_suggestion_not_supported",
  "suggestion_batch_already_reviewed",
  "sidekick_suggestion_required",
  "model_not_available",
  "no_model_available",
  "reasoning_effort_not_supported",
  "structured_output_not_supported",
  "invalid_response_format",
  "tag_not_found",
  "tag_not_on_agent",
  "tag_already_on_agent",
  "tag_change_not_allowed",
  "homepage_use_case_not_found",
  "homepage_use_case_not_dismissible",
  "discovery_pin_target_not_found",
  "discovery_pin_target_not_readable_by_group",
  "discovery_pin_group_not_supported",
  "skill_archived",
  "skill_not_active",
  "skill_not_custom",
  "skill_already_exists",
  "skill_name_empty",
  "skill_name_too_long",
  "skill_editors_missing_space_access",
  "skill_last_editor_removed",
  "skill_attachment_file_invalid",
  "skill_file_not_attached",
  "skill_file_already_exists",
  "skill_instructions_reference_unavailable",
  "skill_already_created",
  "skill_suggestion_invalid",
  "skill_suggestion_outdated",
  "skill_change_not_authorized",
  "skill_suggestion_not_reviewable",
  "skill_suggestion_batch_incomplete",
  "skills_not_detected",
  "skill_archive_invalid",
  "skill_import_invalid",
  "skill_import_not_allowed",
  "skill_github_repository_url_invalid",
  "skill_github_auth_error",
  "skill_github_api_error",
  "skill_github_connection_invalid",
  "sandbox_token_not_allowed",
  "file_not_frame",
  "frame_not_shareable",
  "file_not_mounted",
  "branding_asset_mismatch",
  "frame_text_edit_failed",
  "frame_draft_conflict",
  "frame_make_live_failed",
  "frame_not_in_conversation",
  "file_referenced_by_skill",
  "file_deletion_failed",
  "file_not_in_conversation",
  "frame_sharing_not_allowed",
  "frame_files_unverifiable",
  "frame_user_required",
  "file_already_exists",
  "folder_required",
  "folder_too_large_to_download",
  "archive_too_large",
  "archive_invalid",
  "file_revision_conflict",
  "file_revision_not_supported",
  "comment_unwritable",
  "file_comments_changed",
  "frame_manifest_invalid",
  "sandbox_function_invocation_initiator_required",
  "egress_domain_invalid",
  "sandbox_env_var_invalid",
  "sandbox_env_var_not_found",
  "sandbox_env_var_demotion_not_supported",
  "file_name_invalid",
  "file_already_uploaded",
  "file_upload_expired",
  "file_url_fetch_failed",
  "file_url_not_allowed",
  "metronome_billing_not_configured",
  "credit_priced_plan_required",
  "usage_limit_out_of_range",
  "billing_period_unavailable",
  "api_key_name_required",
  "api_key_already_exists",
  "system_key_spend_limit_not_supported",
  "invalid_email_address",
  "pending_invitations_limit_exceeded",
  "invitation_token_invalid",
  "upgrade_request_reason_required",
  "upgrade_request_not_found",
  "upgrade_request_already_resolved",
  "user_already_has_workspace",
  "user_name_required",
  "provisioned_user_name_not_editable",
  "group_already_exists",
  "group_kind_not_supported",
  "group_not_editable",
  "group_requirements_not_met",
  "user_already_group_member",
  "user_not_group_member",
  "last_group_member_cannot_be_removed",
  "no_matching_members",
  "last_admin_cannot_be_removed",
  "free_seat_already_used",
  "paid_seat_requires_paid_plan",
  "seat_limit_reached",
  "seat_type_not_in_contract",
  "seat_change_preview_unavailable",
  "subscription_cancellation_scheduled",
  "already_on_paid_plan",
  "free_plan_required",
  "payment_setup_incomplete",
  "enterprise_credit_purchase_not_supported",
  "stripe_customer_not_found",
  "credit_purchase_pending",
  "credit_purchase_amount_out_of_range",
  "workspace_phone_not_verified",
  "phone_number_not_accepted",
  "phone_already_used_error",
  "verification_error",
  "invalid_captcha",
  "user_memory_too_long",
  "tag_already_exists",
  "verified_domain_not_found",
  "data_classification_source_not_supported",
  "non_regional_models_in_use",
  "redirect_uri_invalid",
  "trigger_status_managed_by_dust",
  "bulk_automation_limit_exceeded",
  "invalid_trigger_filter",
  "webhook_source_already_exists",
  "webhook_subscribed_events_required",
  "regular_or_global_space_required",
  "system_view_required",
  "mcp_server_view_already_exists",
  "auto_tool_not_removable",
  "mcp_server_name_invalid",
  "mcp_server_url_too_long",
  "invalid_mcp_server_url",
  "remote_mcp_server_connection_failed",
  "mcp_oauth_connection_error",
  "mcp_server_not_available",
  "mcp_server_already_installed",
  "mcp_server_icon_not_editable",
  "mcp_server_bearer_token_not_supported",
  "mcp_credential_connection_not_supported",
  "credential_provider_mismatch",
  "bigquery_project_too_large",
  "bigquery_locations_check_failed",
] as const;

export type RegionRedirectError = CellInfo;

export type APIErrorType = (typeof API_ERROR_TYPES)[number];

// Error types that are expected outcomes of normal operation rather than
// failures (e.g. a cell redirect). Callers can use this to log them at a
// lower level so they don't pollute error monitoring.
export const EXPECTED_API_ERROR_TYPES: ReadonlySet<APIErrorType> = new Set([
  "workspace_in_different_cell",
]);

export type APIError = {
  type: APIErrorType;
  message: string;
  data_source_error?: CoreAPIError;
  run_error?: CoreAPIError;
  app_error?: CoreAPIError;
  connectors_error?: ConnectorsAPIError;
  redirect?: CellInfo;
  unverifiableRefs?: string[];
  // Unix timestamp (seconds) after which a rate-limited verification can be retried.
  retryAfterSeconds?: number;
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
export type APIErrorWithStatusCode<T extends number = number> = {
  api_error: APIError;
  status_code: T;
};

/**
 * Narrow alias of `APIErrorWithStatusCode` constrained to Hono's
 * `ContentfulStatusCode`. Use this in code that ultimately dispatches the
 * error through `c.json(..., status_code)` so the status code can be passed
 * without an `as ContentfulStatusCode` cast.
 */
export type APIErrorWithContentfulStatusCode =
  APIErrorWithStatusCode<ContentfulStatusCode>;

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
