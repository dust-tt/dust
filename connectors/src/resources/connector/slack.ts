import type { Transaction } from "sequelize";

import type { SlackConfigurationModel } from "@connectors/lib/models/slack";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

export class SlackConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<SlackConfigurationModel>,
    transaction: Transaction
  ): Promise<void> {
    await SlackConfigurationResource.makeNew({
      slackTeamId: blob.slackTeamId,
      connectorId: connector.id,
      transaction,
    });
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
}
