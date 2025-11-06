import type { Transaction } from "sequelize";

import { DatabricksConfigurationModel } from "@connectors/lib/models/databricks";
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

export class DatabricksConnectorStrategy
  implements ConnectorProviderStrategy<"databricks">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<DatabricksConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["databricks"] | null> {
    await DatabricksConfigurationModel.create(
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
      DatabricksConfigurationModel.destroy({
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
    Record<ModelId, ConnectorProviderModelResourceMapping["databricks"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
