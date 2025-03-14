import type { Transaction } from "sequelize";

import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import { SnowflakeConfigurationModel } from "@connectors/lib/models/snowflake";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class SnowflakeConnectorStrategy
  implements ConnectorProviderStrategy<"snowflake">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<SnowflakeConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["snowflake"] | null> {
    await SnowflakeConfigurationModel.create(
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
    await Promise.all([
      SnowflakeConfigurationModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      RemoteTableModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      RemoteSchemaModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      RemoteDatabaseModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["snowflake"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
