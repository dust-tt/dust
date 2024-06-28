import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import {
  GithubConnectorState,
  GithubIssue,
} from "@connectors/lib/models/github";
import type {
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class GithubConnectorStrategy
  implements ConnectorProviderStrategy<"github">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<GithubConnectorState>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["github"] | null> {
    await GithubConnectorState.create(
      {
        ...blob,
        connectorId,
      },
      { transaction }
    );
    return null;
  }

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

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["github"]>
  > {
    return {};
  }
}
