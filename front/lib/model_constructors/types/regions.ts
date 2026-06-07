export const EUROPE = "europe" as const;
export const US = "us" as const;
export const GLOBAL = "global" as const;

export const REGIONS = [EUROPE, US, GLOBAL] as const;
export type Region = (typeof REGIONS)[number];
