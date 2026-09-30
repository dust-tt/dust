import { z } from "zod";

export const WEBCRAWLER_MAX_PAGES = 1024;

export const CrawlingFrequencies = [
  "never",
  "daily",
  "weekly",
  "monthly",
] as const;
export type CrawlingFrequency = (typeof CrawlingFrequencies)[number];

export const DepthOptions = [0, 1, 2, 3, 4, 5] as const;
export type DepthOption = (typeof DepthOptions)[number];
export type WebCrawlerConfigurationType = z.infer<
  typeof WebCrawlerConfigurationTypeSchema
>;

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

export const WebCrawlerHeaderRedactedValue = "<REDACTED>";

export const WEBCRAWLER_DEFAULT_CONFIGURATION: WebCrawlerConfigurationType = {
  url: "",
  depth: 2,
  maxPageToCrawl: 50,
  crawlMode: "child",
  crawlFrequency: "monthly",
  headers: {},
};
