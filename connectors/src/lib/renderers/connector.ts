import type {
  ConnectorType,
  WebCrawlerConfigurationType,
} from "@dust-tt/types";

import { WebCrawlerConfiguration } from "@connectors/lib/models/webcrawler";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export async function renderConnectorType(
  connector: ConnectorResource
): Promise<ConnectorType> {
  return {
    id: connector.id.toString(),
    type: connector.type,
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
    lastSyncStatus: connector.lastSyncStatus,
    lastSyncStartTime: connector.lastSyncStartTime?.getTime(),
    lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime?.getTime(),
    firstSuccessfulSyncTime: connector.firstSuccessfulSyncTime?.getTime(),
    firstSyncProgress: connector.firstSyncProgress,
    configuration: await renderConfiguration(connector),
    pausedAt: connector.pausedAt,
  };
}

async function renderConfiguration(connector: ConnectorResource) {
  switch (connector.type) {
    case "webcrawler": {
      const config = await WebCrawlerConfiguration.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      if (!config) {
        throw new Error(
          `Webcrawler configuration not found for connector ${connector.id}`
        );
      }
      return renderWebcrawlerConfiguration(config);
    }
    default:
      return undefined;
  }
}

async function renderWebcrawlerConfiguration(
  webCrawlerConfiguration: WebCrawlerConfiguration
): Promise<WebCrawlerConfigurationType> {
  return {
    url: webCrawlerConfiguration.url,
    maxPageToCrawl: webCrawlerConfiguration.maxPageToCrawl,
    crawlMode: webCrawlerConfiguration.crawlMode,
    depth: webCrawlerConfiguration.depth,
    crawlFrequency: webCrawlerConfiguration.crawlFrequency,
  };
}
