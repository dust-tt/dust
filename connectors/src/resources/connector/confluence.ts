import type { Transaction } from "sequelize";

import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import type { ConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class ConfluenceConnectorStrategy implements ConnectorProviderStrategy {
  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    await Promise.all([
      ConfluenceConfiguration.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      ConfluenceSpace.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      ConfluencePage.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);
  }
}
