import type { Transaction } from "sequelize";

import {
  GithubCodeDirectoryModel,
  GithubCodeFileModel,
  GithubCodeRepositoryModel,
  GithubConnectorStateModel,
  GithubDiscussionModel,
  GithubIssueModel,
} from "@connectors/lib/models/github";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class GithubConnectorStrategy implements ConnectorProviderStrategy<"github"> {
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<GithubConnectorStateModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["github"] | null> {
    await GithubConnectorStateModel.create(
      {
        ...blob,
        connectorId,
      },
      { transaction }
    );
    return null;
  }

  async delete(connector: ConnectorResource, transaction: Transaction) {
    await GithubIssueModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubDiscussionModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubCodeRepositoryModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubCodeFileModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubCodeDirectoryModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GithubConnectorStateModel.destroy({
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

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
