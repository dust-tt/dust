import type { Transaction } from "sequelize";

import {
  GithubConnectorState,
  GithubIssue,
} from "@connectors/lib/models/github";
import type { ConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class GithubConnectorStrategy implements ConnectorProviderStrategy {
  async delete(connector: ConnectorResource, transaction: Transaction) {
    await GithubIssue.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubConnectorState.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
