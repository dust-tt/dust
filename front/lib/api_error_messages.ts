import type { APIErrorType } from "@app/types/error";
import { isAPIError, isAPIErrorResponse } from "@app/types/error";
import type { NotificationType } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

const UNEXPECTED_ERROR_MESSAGE = msg`An unexpected error occurred.`;

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] api-error-type-has-message
 * Every `APIErrorType` MUST map to a user-facing message describing the error on its own, without
 * relying on the server `message`. Adding a type to `API_ERROR_TYPES` without a message here MUST
 * fail typecheck.
 */
export const API_ERROR_MESSAGES: Record<APIErrorType, MessageDescriptor> = {
  not_authenticated: msg`You are not signed in.`,
  sso_enforced: msg`This workspace requires you to sign in with SSO.`,
  missing_authorization_header_error: msg`The request is missing its authorization header.`,
  malformed_authorization_header_error: msg`The request authorization header is malformed.`,
  invalid_basic_authorization_error: msg`The request basic authorization is invalid.`,
  invalid_oauth_token_error: msg`Your session token is invalid.`,
  expired_oauth_token_error: msg`Your session has expired. Sign in again.`,
  invalid_api_key_error: msg`The API key is invalid.`,
  invalid_sandbox_token_error: msg`The sandbox token is invalid.`,
  internal_server_error: msg`Something went wrong on our side.`,
  invalid_request_error: msg`The request is invalid.`,
  invalid_rows_request_error: msg`The table rows are invalid.`,
  user_not_found: msg`User not found.`,
  content_too_large: msg`The content is too large.`,
  data_source_error: msg`The data source returned an error.`,
  data_source_not_found: msg`Data source not found.`,
  data_source_view_not_found: msg`Data source view not found.`,
  data_source_auth_error: msg`You don't have access to this data source.`,
  data_source_quota_error: msg`The data source has reached its quota.`,
  workspace_quota_error: msg`The workspace has reached its quota.`,
  data_source_document_not_found: msg`Document not found.`,
  data_source_not_managed: msg`This data source isn't managed by a connection.`,
  run_error: msg`The run failed.`,
  app_not_found: msg`App not found.`,
  app_auth_error: msg`You don't have access to this app.`,
  provider_auth_error: msg`The model provider rejected the credentials.`,
  provider_not_found: msg`Model provider not found.`,
  dataset_not_found: msg`Dataset not found.`,
  workspace_not_found: msg`Workspace not found.`,
  workspace_in_different_cell: msg`This workspace is hosted in another region.`,
  workspace_auth_error: msg`You don't have access to this workspace.`,
  workspace_can_use_product_required_error: msg`Your workspace can't use this product with its current plan.`,
  workspace_user_not_found: msg`User not found in this workspace.`,
  method_not_supported_error: msg`This operation isn't supported.`,
  personal_workspace_not_found: msg`Personal workspace not found.`,
  action_unknown_error: msg`The action failed with an unknown error.`,
  action_api_error: msg`The action failed.`,
  membership_not_found: msg`Membership not found.`,
  membership_revoked: msg`Your membership to this workspace was revoked.`,
  invitation_not_found: msg`Invitation not found.`,
  plan_limit_error: msg`You've reached a limit of your plan.`,
  template_not_found: msg`Template not found.`,
  chat_message_not_found: msg`Message not found.`,
  connector_not_found_error: msg`Connection not found.`,
  connector_update_error: msg`The connection couldn't be updated.`,
  connector_update_unauthorized: msg`You aren't allowed to update this connection.`,
  connector_oauth_connection_not_found: msg`The connection's authorization wasn't found.`,
  connector_oauth_target_mismatch: msg`The authorized account doesn't match this connection.`,
  connector_oauth_user_missing_rights: msg`The authorized account is missing required permissions.`,
  connector_oauth_user_must_be_admin: msg`The authorized account must be an admin.`,
  connector_provider_not_supported: msg`This connection type isn't supported.`,
  connector_credentials_error: msg`The connection credentials are invalid.`,
  connector_credentials_not_found: msg`The connection credentials weren't found.`,
  connector_operation_in_progress: msg`Another operation is in progress on this connection.`,
  agent_configuration_not_found: msg`Agent not found.`,
  agent_inaccessible: msg`You don't have access to this agent.`,
  agent_group_permission_error: msg`You don't have permission to edit this agent.`,
  agent_message_error: msg`The agent message failed.`,
  unprocessable_entity: msg`The request couldn't be processed.`,
  message_not_found: msg`Message not found.`,
  plan_message_limit_exceeded: msg`You've reached the message limit of your plan.`,
  credits_exhausted: msg`Your workspace has run out of credits.`,
  user_cap_reached: msg`You've reached your usage limit.`,
  group_shared_usage_limit_reached: msg`Your group has reached its shared usage limit.`,
  no_seat: msg`You don't have a seat in this workspace.`,
  model_disabled: msg`This model is disabled.`,
  global_agent_error: msg`This Dust agent couldn't be updated.`,
  stripe_invalid_product_id_error: msg`The billing product is invalid.`,
  rate_limit_error: msg`Too many requests. Try again in a moment.`,
  subscription_payment_failed: msg`The subscription payment failed.`,
  subscription_not_found: msg`Subscription not found.`,
  subscription_state_invalid: msg`The subscription is in an invalid state.`,
  trial_restriction: msg`This isn't available during the trial.`,
  service_unavailable: msg`The service is temporarily unavailable.`,
  assistant_saving_error: msg`The agent couldn't be saved.`,
  unexpected_error_format: msg`The server returned an unexpected error.`,
  unexpected_response_format: msg`The server returned an unexpected response.`,
  unexpected_network_error: msg`A network error occurred.`,
  action_failed: msg`The action failed.`,
  unexpected_action_response: msg`The action returned an unexpected response.`,
  feature_flag_not_found: msg`Feature flag not found.`,
  feature_flag_already_exists: msg`This feature flag already exists.`,
  invalid_pagination_parameters: msg`The pagination parameters are invalid.`,
  table_not_found: msg`Table not found.`,
  invitation_already_sent_recently: msg`An invitation was already sent recently.`,
  dust_app_secret_not_found: msg`Secret not found.`,
  key_not_found: msg`API key not found.`,
  insufficient_key_scope: msg`The API key doesn't have the required scope.`,
  admin_key_analytics_groups_not_allowed: msg`Admin API keys already read the analytics of every group.`,
  analytics_group_kind_not_supported: msg`Analytics access can only be granted on manual or provisioned groups.`,
  transcripts_configuration_not_found: msg`Transcripts configuration not found.`,
  transcripts_configuration_default_not_allowed: msg`This transcripts configuration can't be the default.`,
  transcripts_configuration_already_exists: msg`A transcripts configuration already exists.`,
  file_not_found: msg`File not found.`,
  file_too_large: msg`The file is too large.`,
  file_type_not_supported: msg`This file type isn't supported.`,
  file_is_empty: msg`The file is empty.`,
  file_read_only: msg`You can only read this file.`,
  run_not_found: msg`Run not found.`,
  space_already_exists: msg`A space with this name already exists.`,
  space_not_found: msg`Space not found.`,
  project_task_not_found: msg`Task not found.`,
  group_not_found: msg`Group not found.`,
  invalid_shared_usage_limit_order: msg`The order sent does not list every group with a budget exactly once.`,
  shared_usage_limit_order_changed: msg`The order of group budgets changed since you opened it. Reopen the group to see the current order.`,
  coupon_not_found: msg`Coupon not found.`,
  coupon_not_redeemable: msg`This coupon can't be redeemed.`,
  coupon_already_redeemed: msg`This coupon was already redeemed.`,
  plugin_not_found: msg`Plugin not found.`,
  plugin_execution_failed: msg`The plugin failed.`,
  recommendation_not_found: msg`Recommendation not found.`,
  activation_work_area_not_found: msg`Work area not found.`,
  trigger_not_found: msg`Trigger not found.`,
  webhook_source_not_found: msg`Webhook source not found.`,
  webhook_source_view_auth_error: msg`You don't have access to this webhook source.`,
  webhook_source_auth_error: msg`You don't have access to this webhook source.`,
  webhook_source_view_not_found: msg`Webhook source not found.`,
  webhook_source_view_triggering_agent: msg`This webhook source is used by an agent trigger.`,
  webhook_source_misconfiguration: msg`The webhook source is misconfigured.`,
  webhook_processing_error: msg`The webhook couldn't be processed.`,
  webhook_storage_error: msg`The webhook couldn't be stored.`,
  mcp_server_connection_not_found: msg`Tool connection not found.`,
  mcp_server_view_not_found: msg`Tool not found.`,
  action_not_found: msg`Action not found.`,
  action_not_blocked: msg`This action isn't waiting for approval.`,
  conversation_not_found: msg`Conversation not found.`,
  conversation_access_restricted: msg`You don't have access to this conversation.`,
  conversation_agent_running: msg`An agent is still running in this conversation.`,
  conversation_with_unavailable_agent: msg`This conversation uses an agent that is no longer available.`,
  user_already_participant: msg`You're already a participant in this conversation.`,
  message_deletion_not_authorized: msg`You aren't allowed to delete this message.`,
  message_outdated: msg`This message has changed. Refresh the page and try again.`,
  conversation_context_usage_not_found: msg`Conversation context usage not found.`,
  mcp_auth_error: msg`The tool rejected the credentials.`,
  invalid_mcp_server_id: msg`The tool identifier is invalid.`,
  mcp_server_not_found: msg`Tool not found.`,
  workos_organization_not_found: msg`Organization not found.`,
  workos_server_error: msg`The authentication provider returned an error.`,
  workos_multiple_sso_connections_not_supported: msg`Multiple SSO connections aren't supported.`,
  workos_multiple_directories_not_supported: msg`Multiple directories aren't supported.`,
  user_authentication_required: msg`You need to sign in to continue.`,
  agent_memory_not_found: msg`Agent memory not found.`,
  elasticsearch_error: msg`Search failed.`,
  skill_not_found: msg`Skill not found.`,
  skill_github_repository_not_found: msg`GitHub repository not found.`,
  sandbox_function_not_found: msg`Sandbox function not found.`,
  sandbox_function_invocation_not_found: msg`Sandbox function call not found.`,
  frame_runtime_unavailable: msg`The frame runtime is unavailable.`,
  frame_manifest_not_movable: msg`A Frame's manifest can't be moved or renamed on its own. Move or rename the Frame's folder instead.`,
  fast_function_called_tools: msg`A fast function can't call tools.`,
  project_metadata_not_found: msg`Project details not found.`,
  agent_suggestion_not_found: msg`Suggestion not found.`,
  batch_suggestion_not_found: msg`Suggestions not found.`,
  wakeup_not_found: msg`Wake-up not found.`,
  conversation_locked: msg`Another user has an active wake-up in this conversation. Only they can post until it fires or is cancelled.`,
};

export type FormatErrorOptions = {
  /** Whether the `localisation` feature flag is enabled for the current workspace. */
  hasLocalisation: boolean;
};

export type FormattedError = {
  /** User-facing description of what failed. */
  description: string;
  /** Raw error code and untranslated message, shown under the collapsed "Details" of a toast. */
  details?: string;
};

function getRawDetails(error: unknown): string | undefined {
  const lines: string[] = [];
  if (typeof error === "object" && error !== null) {
    if ("type" in error && typeof error.type === "string") {
      const code = error.type;
      lines.push(t`Code: ${code}`);
    }
    if ("message" in error && typeof error.message === "string") {
      const rawMessage = error.message;
      lines.push(t`Message: ${rawMessage}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

// The untranslated message of a value, or of the error it wraps (`{ error: { message } }`).
// Stops on self-referential wrappers instead of looping forever.
function getRawMessage(error: unknown): string | undefined {
  const seen = new Set<object>();
  let current = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current);
    if (
      "message" in current &&
      typeof current.message === "string" &&
      current.message
    ) {
      return current.message;
    }
    if (!("error" in current)) {
      return undefined;
    }
    current = current.error;
  }
  return undefined;
}

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;product] error-translation-behind-localisation-flag
 * When `hasLocalisation` is false, `formatError` MUST return no `details`, and as `description` the
 * raw `message` of the value (an API error, an `APIErrorResponse`, an `Error`, or any value
 * wrapping one as `{ error: { message } }`), falling back to `UNEXPECTED_ERROR_MESSAGE` only when
 * there is none, so workspaces without the flag keep seeing the messages they saw before. Callers
 * MUST pass the `localisation` feature flag of the current workspace.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] format-error-api-errors
 * When `hasLocalisation` is true, for an API error, or an `APIErrorResponse` wrapping one,
 * `description` MUST be the translation of its `type` from `API_ERROR_MESSAGES`, and `details` MUST
 * hold its raw `type` and untranslated `message`. The server `message` MUST NOT appear in
 * `description`.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] format-error-other-values
 * When `hasLocalisation` is true, for any other value (network `TypeError`, non-API `Error`,
 * connectors error, unknown `type`, `undefined`, ...), `description` MUST be the translated
 * `UNEXPECTED_ERROR_MESSAGE`, and `details` holds the value's `type` and `message` when it has them.
 * `formatError` MUST NOT throw.
 */
export function formatError(
  error: unknown,
  options: FormatErrorOptions
): FormattedError {
  try {
    return formatErrorUnsafe(error, options);
  } catch {
    // Inspecting `error` can throw (e.g. a throwing getter): fall back rather than fail the caller.
    return { description: t(UNEXPECTED_ERROR_MESSAGE) };
  }
}

function formatErrorUnsafe(
  error: unknown,
  { hasLocalisation }: FormatErrorOptions
): FormattedError {
  const apiError = isAPIErrorResponse(error)
    ? error.error
    : isAPIError(error)
      ? error
      : null;

  if (!hasLocalisation) {
    return {
      description:
        apiError?.message ??
        getRawMessage(error) ??
        t(UNEXPECTED_ERROR_MESSAGE),
    };
  }

  return {
    description: apiError
      ? t(API_ERROR_MESSAGES[apiError.type])
      : t(UNEXPECTED_ERROR_MESSAGE),
    details: getRawDetails(apiError ?? error),
  };
}

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] error-notification-shape
 * Returns an `error` notification whose `title` is the given title (the action that failed) and
 * whose `description` and `details` are those of `formatError(error, options)`.
 */
export function errorNotification(
  title: string,
  error: unknown,
  options: FormatErrorOptions
): NotificationType {
  return { type: "error", title, ...formatError(error, options) };
}
