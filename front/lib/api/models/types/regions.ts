export const REGIONS = ["europe", "us", "global"] as const;
export type Region = (typeof REGIONS)[number];
