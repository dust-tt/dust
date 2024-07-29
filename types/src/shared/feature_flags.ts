export const WHITELISTABLE_FEATURES = [
  "workspace_analytics",
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "document_tracker",
  "microsoft_connector",
  "visualization_action_flag",
  "dust_splitted_ds_flag",
  "test_oauth_setup",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
