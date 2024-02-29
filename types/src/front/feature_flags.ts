export const WHITELISTABLE_FEATURES = [
  "workspace_analytics",
  "usage_data_api",
  "brieviety_prompt",
] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
