export const WHITELISTABLE_FEATURES = [
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "document_tracker",
  "use_app_for_header_detection",
  "openai_o1_feature",
  "openai_o1_mini_feature",
  "zendesk_connector_feature",
  "index_private_slack_channel",
  "conversations_jit_actions",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
