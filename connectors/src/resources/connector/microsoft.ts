import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import type { MicrosoftConfigurationModel } from "@connectors/lib/models/microsoft";
import type {
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftConfigurationResource } from "@connectors/resources/microsoft_resource";

export class MicrosoftConnectorStrategy
  implements ConnectorProviderStrategy<"microsoft">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<MicrosoftConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["microsoft"] | null> {
    await MicrosoftConfigurationResource.makeNew(
      {
        ...blob,
        connectorId,
      },
      transaction
    );
    return null;
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

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["microsoft"]>
  > {
    return {};
  }
}
