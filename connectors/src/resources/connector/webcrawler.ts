import type { Transaction } from "sequelize";

import {
  WebCrawlerConfiguration,
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class WebCrawlerStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<WebCrawlerConfiguration>,
    transaction: Transaction
  ): Promise<void> {
    await WebCrawlerConfiguration.create(
      {
        ...blob,
        connectorId: connector.id,
      },
      { transaction }
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
    await WebCrawlerConfiguration.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
