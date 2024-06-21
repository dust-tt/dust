import type { Transaction } from "sequelize";

import {
  MicrosoftSharepointConfiguration,
  MicrosoftTeamsConfiguration,
} from "@connectors/lib/models/microsoft";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class MicrosoftSharepointConnectorStrategy
  implements ConnectorProviderStrategy
{
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<MicrosoftSharepointConfiguration>,
    transaction: Transaction
  ): Promise<void> {
    await MicrosoftSharepointConfiguration.create(
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
    await MicrosoftSharepointConfiguration.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}

export class MicrosoftTeamsConnectorStrategy
  implements ConnectorProviderStrategy
{
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<MicrosoftSharepointConfiguration>,
    transaction: Transaction
  ): Promise<void> {
    await MicrosoftTeamsConfiguration.create(
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
    await MicrosoftTeamsConfiguration.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
