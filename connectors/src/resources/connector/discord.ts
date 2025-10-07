import type { Transaction } from "sequelize";

import type { DiscordConfigurationModel } from "@connectors/lib/models/discord";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { DiscordConfigurationResource } from "@connectors/resources/discord_configuration_resource";
import type { ModelId } from "@connectors/types";

export class DiscordConnectorStrategy
  implements ConnectorProviderStrategy<"discord_bot">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<DiscordConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["discord_bot"] | null> {
    return DiscordConfigurationResource.makeNew({
      guildId: blob.guildId,
      connectorId,
      transaction,
    });
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const config = await DiscordConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!config) {
      throw new Error(
        `Discord configuration not found for connector ${connector.id}`
      );
    }
    await config.delete(transaction);

    return;
  }

  async fetchConfigurationsbyConnectorIds(
    connectorIds: ModelId[]
  ): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["discord_bot"]>
  > {
    return DiscordConfigurationResource.fetchByConnectorIds(connectorIds);
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
