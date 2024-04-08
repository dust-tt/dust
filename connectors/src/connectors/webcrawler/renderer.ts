import type { WebCrawlerConfigurationType } from "@dust-tt/types";
import { WebCrawlerHeaderRedactedValue } from "@dust-tt/types";

import type { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";

export async function renderWebcrawlerConfiguration(
  webCrawlerConfiguration: WebCrawlerConfigurationResource
): Promise<WebCrawlerConfigurationType> {
  const headers = await webCrawlerConfiguration.getCustomHeaders();
  const redactedHeaders: Record<string, string> = {};
  for (const key in headers) {
    // redacting headers values when rendering them because we don't want to expose sensitive information.
    redactedHeaders[key] = WebCrawlerHeaderRedactedValue;
  }
  return {
    url: webCrawlerConfiguration.url,
    maxPageToCrawl: webCrawlerConfiguration.maxPageToCrawl,
    crawlMode: webCrawlerConfiguration.crawlMode,
    depth: webCrawlerConfiguration.depth,
    crawlFrequency: webCrawlerConfiguration.crawlFrequency,
    headers: redactedHeaders,
  };
}
