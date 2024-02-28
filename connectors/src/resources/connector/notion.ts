import type { Transaction } from "sequelize";

import {
  NotionConnectorBlockCacheEntry,
  NotionConnectorPageCacheEntry,
  NotionConnectorResourcesToCheckCacheEntry,
  NotionConnectorState,
  NotionPage,
} from "@connectors/lib/models/notion";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class NotionConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<NotionConnectorState>,
    transaction: Transaction
  ): Promise<void> {
    await NotionConnectorState.create(
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
    await NotionPage.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorState.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorBlockCacheEntry.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorPageCacheEntry.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorResourcesToCheckCacheEntry.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
