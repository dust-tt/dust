export const WHITELISTABLE_FEATURES = ["crawler", "structured_data"] as const;
export type WhitelistableFeature = (typeof WHITELISTABLE_FEATURES)[number];
