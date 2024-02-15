export const WEBCRAWLER_MAX_DEPTH = 5;
export const WEBCRAWLER_MAX_PAGES = 512;

export const CrawlingFrequencies = ["daily", "weekly", "monthly"] as const;
export type CrawlingFrequency = (typeof CrawlingFrequencies)[number];
