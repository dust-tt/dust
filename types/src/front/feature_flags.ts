export const WHITELISTABLE_FEATURES = [
  "crawler",
  "structured_data",
  "workspace_analytics",
  "mistral_next",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
