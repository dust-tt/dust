export const WHITELISTABLE_FEATURES = [
  "auto_pre_ingest_all_databases",
  "crawler",
  "intercom_connection",
  "mistral_next",
  "structured_data",
  "workspace_analytics",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
