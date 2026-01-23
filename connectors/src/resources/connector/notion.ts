import type { Transaction } from "sequelize";

import {
  NotionConnectorBlockCacheEntryModel,
  NotionConnectorPageCacheEntryModel,
  NotionConnectorResourcesToCheckCacheEntryModel,
  NotionConnectorStateModel,
  NotionDatabaseModel,
  NotionPageModel,
} from "@connectors/lib/models/notion";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class NotionConnectorStrategy implements ConnectorProviderStrategy<"notion"> {
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<NotionConnectorStateModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["notion"] | null> {
    await NotionConnectorStateModel.create(
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
    await NotionPageModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionDatabaseModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorStateModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorBlockCacheEntryModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorPageCacheEntryModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await NotionConnectorResourcesToCheckCacheEntryModel.destroy({
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
