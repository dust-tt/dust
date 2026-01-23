import { z } from "zod";

export const WEBCRAWLER_MAX_DEPTH = 5;
export const WEBCRAWLER_MAX_PAGES = 1024;

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

export function isDepthOption(value: unknown): value is DepthOption {
  return DepthOptions.includes(value as DepthOption);
}

export const WebCrawlerConfigurationTypeSchema = z.object({
  url: z.string(),
  depth: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  maxPageToCrawl: z.number(),
  crawlMode: z.enum(["child", "website"]),
  crawlFrequency: z.enum(["never", "daily", "weekly", "monthly"]),
  headers: z.record(z.string(), z.string()),
});

export type WebCrawlerConfigurationType = z.infer<
  typeof WebCrawlerConfigurationTypeSchema
>;

export type WebCrawlerConfiguration = z.infer<
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
