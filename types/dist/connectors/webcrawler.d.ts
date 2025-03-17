import * as t from "io-ts";
export declare const WEBCRAWLER_MAX_DEPTH = 5;
export declare const WEBCRAWLER_MAX_PAGES = 512;
export declare const CrawlingModes: readonly ["child", "website"];
export type CrawlingMode = (typeof CrawlingModes)[number];
export declare const CrawlingFrequencies: readonly ["never", "daily", "weekly", "monthly"];
export type CrawlingFrequency = (typeof CrawlingFrequencies)[number];
export declare const DepthOptions: readonly [0, 1, 2, 3, 4, 5];
export type DepthOption = (typeof DepthOptions)[number];
export type WebCrawlerConfigurationType = t.TypeOf<typeof WebCrawlerConfigurationTypeSchema>;
export declare function isDepthOption(value: unknown): value is DepthOption;
export declare const WebCrawlerConfigurationTypeSchema: t.TypeC<{
    url: t.StringC;
    depth: t.UnionC<[t.LiteralC<0>, t.LiteralC<1>, t.LiteralC<2>, t.LiteralC<3>, t.LiteralC<4>, t.LiteralC<5>]>;
    maxPageToCrawl: t.NumberC;
    crawlMode: t.UnionC<[t.LiteralC<"child">, t.LiteralC<"website">]>;
    crawlFrequency: t.UnionC<[t.LiteralC<"never">, t.LiteralC<"daily">, t.LiteralC<"weekly">, t.LiteralC<"monthly">]>;
    headers: t.RecordC<t.StringC, t.StringC>;
}>;
export type WebCrawlerConfiguration = t.TypeOf<typeof WebCrawlerConfigurationTypeSchema>;
export declare const WebCrawlerHeaderRedactedValue = "<REDACTED>";
export declare const WEBCRAWLER_DEFAULT_CONFIGURATION: WebCrawlerConfigurationType;
//# sourceMappingURL=webcrawler.d.ts.map