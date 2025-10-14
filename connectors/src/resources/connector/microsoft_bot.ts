import type { Transaction } from "sequelize";

import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { MicrosoftBotConfigurationModel } from "@connectors/lib/models/microsoft_bot";
import { MicrosoftBotConfigurationResource } from "@connectors/resources/microsoft_bot_resources";

export class MicrosoftBotConnectorStrategy
  implements ConnectorProviderStrategy<"microsoft_bot">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<MicrosoftBotConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["microsoft_bot"] | null> {
    return MicrosoftBotConfigurationResource.makeNew(
      {
        ...blob,
        connectorId,
      },
      transaction
    );
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const resource = await MicrosoftBotConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!resource) {
      throw new Error(
        `No MicrosoftBotConfigurationResource found for connector ${connector.id}`
      );
    }
    await resource.delete(transaction);
  }

  async fetchConfigurationsbyConnectorIds(
    connectorIds: ModelId[]
  ): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["microsoft_bot"]>
  > {
    return MicrosoftBotConfigurationResource.fetchByConnectorIds(connectorIds);
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
