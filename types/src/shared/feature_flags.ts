export const WHITELISTABLE_FEATURES = [
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "labs_transcripts_gong_full_storage",
  "document_tracker",
  "use_app_for_header_detection",
  "openai_o1_feature",
  "openai_o1_mini_feature",
  "index_private_slack_channel",
  "conversations_jit_actions",
  "labs_trackers",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
