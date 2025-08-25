import type { Transaction } from "sequelize";

import type { SlackLabsConfigurationModel } from "@connectors/lib/models/slack";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackLabsConfigurationResource } from "@connectors/resources/slack_labs_configuration_resource";
import type { ModelId } from "@connectors/types";

export class SlackLabsConnectorStrategy
  implements ConnectorProviderStrategy<"slack_labs">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<SlackLabsConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["slack_labs"] | null> {
    return SlackLabsConfigurationResource.makeNew({
      slackTeamId: blob.slackTeamId,
      channelId: blob.channelId,
      agentConfigurationId: blob.agentConfigurationId,
      isEnabled: blob.isEnabled,
      connectorId,
      transaction,
    });
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const slackLabsConfiguration =
      await SlackLabsConfigurationResource.fetchByConnectorId(connector.id);
    if (slackLabsConfiguration) {
      const result = await slackLabsConfiguration.delete(transaction);
      if (result.isErr()) {
        throw result.error;
      }
    }
  }

  async fetchConfigurationsbyConnectorIds(
    connectorIds: ModelId[]
  ): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["slack_labs"]>
  > {
    return SlackLabsConfigurationResource.fetchByConnectorIds(connectorIds);
  }

  configurationJSON(
    configuration: SlackLabsConfigurationResource
  ): ConnectorProviderConfigurationType {
    return configuration.toJSON();
  }
}
