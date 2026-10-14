export type DustErrorCode =
  | "core_api_error"
  | "internal_error"
  | "invalid_id"
  | "limit_reached"
  | "connection_not_found"
  | "file_not_found"
  | "audio_transcription_unavailable"
  | "unauthorized"
  | "agent_loop_already_running"
  | "compaction_already_running"
  | "data_source_not_found"
  | "data_source_view_not_found"
  | "space_not_found"
  | "invalid_request_error"
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
  | "group_requirements_not_met"
  | "group_not_found"
  | "invalid_group_kind"
  | "last_group_member"
  | "admin_key_analytics_groups_not_allowed"
  | "analytics_group_kind_not_supported"
  // MCP Server errors
  | "remote_server_not_found"
  | "internal_server_not_found"
  | "mcp_server_view_not_found"
  | "name_conflict"
  | "action_not_found"
  | "action_not_blocked"
  | "action_not_editable"
  | "invalid_edited_arguments"
  | "mcp_access_token_error"
  | "missing_url"
  | "url_too_long"
  | "invalid_name"
  | "oauth_connection_error"
  | "remote_server_error"
  | "invalid_internal_server_name"
  | "server_not_available"
  | "server_already_installed"
  | "system_view_not_found"
  // Triggers errors
  | "webhook_source_not_found"
  // Activation errors
  | "activation_work_area_not_found"
  // Agent errors (domain:agents)
  | "agent_configuration_not_found"
  | "agent_archived"
  | "active_custom_agent_required"
  | "agent_already_created"
  | "agent_editor_required"
  | "user_already_agent_editor"
  | "user_not_agent_editor"
  | "editor_not_workspace_member"
  | "tag_not_on_agent"
  | "tag_already_on_agent"
  | "tag_change_not_allowed"
  | "model_not_available"
  | "reasoning_effort_not_supported"
  | "structured_output_not_supported"
  | "invalid_response_format"
  | "conflicting_suggestions"
  | "agent_suggestion_not_applicable"
  | "agent_suggestion_not_supported"
  | "assistant_saving_error"
  | "skill_not_found"
  | "discovery_pin_target_not_found"
  | "discovery_pin_target_not_readable_by_group"
  | "discovery_pin_group_not_supported"
  // Skill errors (domain:skills)
  | "skill_archived"
  | "skill_not_active"
  | "skill_change_not_authorized"
  | "skill_name_empty"
  | "skill_name_too_long"
  | "skill_already_exists"
  | "skill_editors_missing_space_access"
  | "skill_last_editor_removed"
  | "skill_instructions_reference_unavailable"
  | "skill_file_not_attached"
  | "skill_file_already_exists"
  | "skill_already_created"
  | "skill_suggestion_invalid"
  | "skill_suggestion_outdated"
  | "skill_suggestion_batch_incomplete"
  | "file_too_large"
  | "file_type_not_supported"
  | "file_is_empty"
  // Frame file access errors (domain:files)
  | "frame_files_unverifiable"
  | "frame_user_required"
  // Space errors
  | "space_already_exists"
  // Space errors (domain:spaces)
  | "project_space_required"
  | "global_space_not_renamable"
  | "embedding_api_key_missing"
  | "file_not_previewable"
  | "file_not_mounted"
  | "project_task_not_found"
  // Conversation errors
  | "conversation_not_found"
  | "failed_to_copy_files"
  | "no_unread_messages_found"
  | "no_blocked_actions"
  | "agent_message_not_resumable"
  | "no_whitelisted_model_found"
  | "generation_failed"
  | "invalid_conversation"
  | "conversation_agent_running"
  | "conversation_locked"
  | "fork_source_message_not_found"
  // Workspace errors (domain:workspace)
  | "api_key_name_required"
  | "usage_limit_out_of_range"
  | "credit_priced_plan_required"
  // Subscription / billing errors
  | "subscription_already_exists"
  | "workspace_not_found"
  | "plan_not_found"
  | "metronome_error"
  | "coupon_redemption_error";

export class DustError<T extends DustErrorCode = DustErrorCode> extends Error {
  constructor(
    readonly code: T,
    message: string
  ) {
    super(message);
  }
}

export function isDustErrorWithCode<T extends DustErrorCode>(
  error: unknown,
  code: T
): error is DustError<T> {
  return error instanceof DustError && error.code === code;
}
