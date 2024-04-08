import type { Transaction } from "sequelize";

import type { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";

export class WebCrawlerStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<WebCrawlerConfigurationModel>,
    transaction: Transaction
  ): Promise<void> {
    await WebCrawlerConfigurationResource.makeNew(
      {
        ...blob,
        connectorId: connector.id,
      },
      transaction
    );
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const resource = await WebCrawlerConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!resource) {
      throw new Error(
        `No WebCrawlerConfiguration found for connector ${connector.id}`
      );
    }
    await resource.delete(transaction);
  }
}
