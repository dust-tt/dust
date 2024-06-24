import type { Transaction } from "sequelize";

import { MicrosoftConfiguration } from "@connectors/lib/models/microsoft";
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
