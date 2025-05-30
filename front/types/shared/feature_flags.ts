export const WHITELISTABLE_FEATURES = [
  "advanced_notion_management",
  "claude_3_7_reasoning",
  "claude_4_opus_feature",
  "co_edition",
  "deepseek_feature",
  "deepseek_r1_global_agent_feature",
  "dev_mcp_actions",
  "disable_run_logs",
  "force_gdrive_labels_scope",
  "google_ai_studio_experimental_models_feature",
  "index_private_slack_channel",
  "labs_connection_hubspot",
  "labs_connection_linear",
  "labs_salesforce_personal_connections",
  "labs_trackers",
  "labs_transcripts",
  "okta_enterprise_connection",
  "openai_o1_custom_assistants_feature",
  "openai_o1_feature",
  "openai_o1_high_reasoning_custom_assistants_feature",
  "openai_o1_high_reasoning_feature",
  "openai_o1_mini_feature",
  "salesforce_feature",
  "pro_plan_salesforce_connector",
  "show_debug_tools",
  "usage_data_api",
  "custom_webcrawler",
  "exploded_tables_query",
  "salesforce_tool",
  "gmail_tool",
  "agent_builder_v2",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
