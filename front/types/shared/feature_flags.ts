export const WHITELISTABLE_FEATURES = [
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_features",
  "labs_transcripts",
  "labs_connection_hubspot",
  "labs_trackers",
  "labs_salesforce_personal_connections",
  "openai_o1_feature",
  "openai_o1_mini_feature",
  "openai_o1_high_reasoning_feature",
  "openai_o1_custom_assistants_feature",
  "openai_o1_high_reasoning_custom_assistants_feature",
  "deepseek_feature",
  "google_ai_studio_experimental_models_feature",
  "index_private_slack_channel",
  "disable_run_logs",
  "show_debug_tools",
  "deepseek_r1_global_agent_feature",
  "salesforce_feature",
  "advanced_notion_management",
  "force_gdrive_labels_scope",
  "claude_3_7_reasoning",
  "mcp_actions",
  "dev_mcp_actions",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
