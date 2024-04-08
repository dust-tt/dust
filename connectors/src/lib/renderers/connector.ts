import type {
  ConnectorType,
  WebCrawlerConfigurationType,
} from "@dust-tt/types";

import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";

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
      const config = await WebCrawlerConfigurationResource.fetchByConnectorId(
        connector.id
      );
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
  webCrawlerConfiguration: WebCrawlerConfigurationResource
): Promise<WebCrawlerConfigurationType> {
  return {
    url: webCrawlerConfiguration.url,
    maxPageToCrawl: webCrawlerConfiguration.maxPageToCrawl,
    crawlMode: webCrawlerConfiguration.crawlMode,
    depth: webCrawlerConfiguration.depth,
    crawlFrequency: webCrawlerConfiguration.crawlFrequency,
    headers: await webCrawlerConfiguration.getCustomHeaders(),
  };
}
