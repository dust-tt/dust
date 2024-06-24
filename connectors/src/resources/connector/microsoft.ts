import type { Transaction } from "sequelize";

import {
  MicrosoftConfiguration,
  MicrosoftConfigurationRoot,
} from "@connectors/lib/models/microsoft";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class MicrosoftConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<MicrosoftConfiguration>,
    transaction: Transaction
  ): Promise<void> {
    await MicrosoftConfiguration.create(
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
    await MicrosoftConfiguration.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}

export class MicrosoftConfigurationResource {
  static async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<MicrosoftConfiguration>,
    transaction: Transaction
  ): Promise<void> {
    await MicrosoftConfiguration.create(
      {
        ...blob,
        connectorId: connector.id,
      },
      { transaction }
    );
  }

  static async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    await MicrosoftConfiguration.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}

export class MicrosoftConfigurationRootResource {
  static async batchMakeNew(
    resources: WithCreationAttributes<MicrosoftConfigurationRoot>[]
  ) {
    console.log("batchMakeNew", resources);
    return MicrosoftConfigurationRoot.bulkCreate(resources);
  }

  static async batchDelete(resourceIds: string[]) {
    console.log("batchDelete", resourceIds);
    return MicrosoftConfigurationRoot.destroy({
      where: {
        resourceId: resourceIds,
      },
    });
  }

  static async listRootsByConnectorId(
    connectorId: number
  ): Promise<MicrosoftConfigurationRoot[]> {
    return MicrosoftConfigurationRoot.findAll({
      where: {
        connectorId,
      },
    });
  }
}
