import type { Transaction } from "sequelize";

import type { MicrosoftConfigurationModel } from "@connectors/lib/models/microsoft";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftConfigurationResource } from "@connectors/resources/microsoft_resource";

export class MicrosoftConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<MicrosoftConfigurationModel>,
    transaction: Transaction
  ): Promise<void> {
    await MicrosoftConfigurationResource.makeNew(
      {
        ...blob,
        connectorId: connector.id,
      },
      transaction
    );
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const resource = await MicrosoftConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!resource) {
      throw new Error(
        `No MicrosoftConfigurationResource found for connector ${connector.id}`
      );
    }
    await resource.delete(transaction);
  }
}
