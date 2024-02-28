import type { Transaction } from "sequelize";

import {
  IntercomArticle,
  IntercomCollection,
  IntercomConversation,
  IntercomHelpCenter,
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import type {
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class IntercomConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: WithCreationAttributes<IntercomWorkspace>,
    transaction: Transaction
  ): Promise<void> {
    await IntercomWorkspace.create(
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
    await Promise.all([
      IntercomWorkspace.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomHelpCenter.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomCollection.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomArticle.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomTeam.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomConversation.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);
  }
}
