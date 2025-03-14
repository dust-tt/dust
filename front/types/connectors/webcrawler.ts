import * as t from "io-ts";

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
export type WebCrawlerConfigurationType = t.TypeOf<
  typeof WebCrawlerConfigurationTypeSchema
>;

export function isDepthOption(value: unknown): value is DepthOption {
  return DepthOptions.includes(value as DepthOption);
}

export const WebCrawlerConfigurationTypeSchema = t.type({
  url: t.string,
  depth: t.union([
    t.literal(0),
    t.literal(1),
    t.literal(2),
    t.literal(3),
    t.literal(4),
    t.literal(5),
  ]),
  maxPageToCrawl: t.number,
  crawlMode: t.union([t.literal("child"), t.literal("website")]),
  crawlFrequency: t.union([
    t.literal("never"),
    t.literal("daily"),
    t.literal("weekly"),
    t.literal("monthly"),
  ]),
  headers: t.record(t.string, t.string),
});

export type WebCrawlerConfiguration = t.TypeOf<
  typeof WebCrawlerConfigurationTypeSchema
>;

export const WebCrawlerHeaderRedactedValue = "<REDACTED>";

export const WEBCRAWLER_DEFAULT_CONFIGURATION: WebCrawlerConfigurationType = {
  url: "",
  depth: 2,
  maxPageToCrawl: 50,
  crawlMode: "website",
  crawlFrequency: "monthly",
  headers: {},
};
