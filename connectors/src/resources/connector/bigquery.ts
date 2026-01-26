import type { Transaction } from "sequelize";

import { BigQueryConfigurationModel } from "@connectors/lib/models/bigquery";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class BigQueryConnectorStrategy
  implements ConnectorProviderStrategy<"bigquery">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<BigQueryConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["bigquery"] | null> {
    await BigQueryConfigurationModel.create(
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
      BigQueryConfigurationModel.destroy({
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
    Record<ModelId, ConnectorProviderModelResourceMapping["bigquery"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
