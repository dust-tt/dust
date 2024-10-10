export const WHITELISTABLE_FEATURES = [
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "labs_transcripts_datasource",
  "document_tracker",
  "private_data_vaults_feature",
  "use_app_for_header_detection",
  "openai_o1_feature",
  "openai_o1_mini_feature",
  "snowflake_connector_feature",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
