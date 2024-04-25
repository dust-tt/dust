import type { ConnectorType } from "@dust-tt/types";

import { renderWebcrawlerConfiguration } from "@connectors/connectors/webcrawler/renderer";
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
    updatedAt: connector.updatedAt.getTime(),
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
