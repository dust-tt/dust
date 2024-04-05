import type { Transaction } from "sequelize";

import {
  WebCrawlerConfigurationModel,
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
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
    await WebCrawlerPage.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await WebCrawlerFolder.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await WebCrawlerConfigurationModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
