import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import {
  NotionConnectorBlockCacheEntry,
  NotionConnectorPageCacheEntry,
  NotionConnectorResourcesToCheckCacheEntry,
  NotionConnectorState,
  NotionPage,
} from "@connectors/lib/models/notion";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class NotionConnectorStrategy
  implements ConnectorProviderStrategy<"notion">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<NotionConnectorState>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["notion"] | null> {
    await NotionConnectorState.create(
      {
        ...blob,
        connectorId,
      },
      { transaction }
    );
    return null;
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

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["notion"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
