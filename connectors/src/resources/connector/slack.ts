import type { Transaction } from "sequelize";

import {
  SlackChannel,
  SlackConfiguration,
  SlackMessages,
} from "@connectors/lib/models/slack";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class SlackConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<SlackConfiguration>,
    transaction: Transaction
  ): Promise<void> {
    const { slackTeamId } = blob;

    const otherSlackConfigurationWithBotEnabled =
      await SlackConfiguration.findOne({
        where: {
          slackTeamId,
          botEnabled: true,
        },
        transaction,
      });

    await SlackConfiguration.create(
      {
        ...blob,
        botEnabled: otherSlackConfigurationWithBotEnabled ? false : true,
        connectorId: connector.id,
      },
      { transaction }
    );
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    await SlackChannel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await SlackMessages.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await SlackConfiguration.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
