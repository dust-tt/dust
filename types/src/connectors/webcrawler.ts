export const WEBCRAWLER_MAX_DEPTH = 5;
export const WEBCRAWLER_MAX_PAGES = 512;

export const CrawlingModes = ["child", "website"] as const;
export type CrawlingMode = (typeof CrawlingModes)[number];

export const CrawlingFrequencies = [
  "never",
  "daily",
  "weekly",
  "monthly",
] as const;
export type CrawlingFrequency = (typeof CrawlingFrequencies)[number];

export const DepthOptions = [0, 1, 2, 3, 4, 5] as const;
export type DepthOption = (typeof DepthOptions)[number];
export type WebCrawlerConfigurationType = {
  url: string;
  maxPageToCrawl: number;
  crawlMode: CrawlingMode;
  depth: DepthOption;
  crawlFrequency: CrawlingFrequency;
};

export function isDepthOption(value: unknown): value is DepthOption {
  return DepthOptions.includes(value as DepthOption);
}
