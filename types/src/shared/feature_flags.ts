export const WHITELISTABLE_FEATURES = [
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "labs_transcripts_full_storage",
  "document_tracker",
  "openai_o1_feature",
  "openai_o1_mini_feature",
  "openai_o1_high_reasoning_feature",
  "openai_o1_custom_assistants_feature",
  "openai_o1_high_reasoning_custom_assistants_feature",
  "deepseek_feature",
  "google_ai_studio_experimental_models_feature",
  "index_private_slack_channel",
  "conversations_jit_actions",
  "disable_run_logs",
  "labs_trackers",
  "show_debug_tools",
  "labs_github_actions",
  "deepseek_r1_global_agent_feature",
  "bigquery_feature",
  "tags_filters",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
