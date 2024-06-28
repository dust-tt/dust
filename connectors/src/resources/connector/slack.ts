import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import type { SlackConfigurationModel } from "@connectors/lib/models/slack";
import type {
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

export class SlackConnectorStrategy
  implements ConnectorProviderStrategy<"slack">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<SlackConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["slack"] | null> {
    await SlackConfigurationResource.makeNew({
      slackTeamId: blob.slackTeamId,
      connectorId,
      transaction,
    });
    return null;
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const config = await SlackConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!config) {
      throw new Error(
        `Slack configuration not found for connector ${connector.id}`
      );
    }
    await config.delete(transaction);

    return;
  }

  async fetchConfigurationsbyConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, ConnectorProviderModelResourceMapping["slack"]>> {
    return SlackConfigurationResource.fetchByConnectorIds(connectorIds);
  }
}
