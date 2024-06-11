export const WHITELISTABLE_FEATURES = [
  "workspace_analytics",
  "usage_data_api",
  "okta_enterprise_connection",
  "labs_transcripts",
  "multi_actions",
  "websearch_action",
  "browse_action",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
