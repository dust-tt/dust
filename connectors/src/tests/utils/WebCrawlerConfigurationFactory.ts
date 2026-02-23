import { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";
import type { Attributes } from "sequelize";

export class WebCrawlerConfigurationResourceFactory {
  /**
   * Create a mock resource that isn't store in database
   */
  static createMock(
    overrides: Partial<Attributes<WebCrawlerConfigurationModel>> = {}
  ): WebCrawlerConfigurationResource {
    const baseConfig = {
      id: 1,
      connectorId: 1,
      url: "https://example.com/blog",
      depth: 3,
      maxPageToCrawl: 50,
      crawlMode: "website",
      crawlFrequency: "daily",
      lastCrawledAt: null,
      crawlId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sitemapOnly: false,
      actions: null,
    } satisfies Attributes<WebCrawlerConfigurationModel>;

    // Create a new resource with the model and merged configuration
    const config = { ...baseConfig, ...overrides };
    return new WebCrawlerConfigurationResource(
      WebCrawlerConfigurationModel,
      config
    );
  }
}
