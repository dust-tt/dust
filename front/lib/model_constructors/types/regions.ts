export const EUROPE = "europe";
export const US = "us";
export const GLOBAL = "global";

export const REGIONS = [EUROPE, US, GLOBAL] as const;
export type Region = (typeof REGIONS)[number];
