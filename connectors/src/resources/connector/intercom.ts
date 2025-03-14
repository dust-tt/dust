import type { Transaction } from "sequelize";

import {
  IntercomArticleModel,
  IntercomCollectionModel,
  IntercomConversationModel,
  IntercomHelpCenterModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class IntercomConnectorStrategy
  implements ConnectorProviderStrategy<"intercom">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<IntercomWorkspaceModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["intercom"] | null> {
    await IntercomWorkspaceModel.create(
      {
        ...blob,
        connectorId,
      },
      { transaction }
    );
    return null;
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    await Promise.all([
      IntercomWorkspaceModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomHelpCenterModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomCollectionModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomArticleModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomTeamModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      IntercomConversationModel.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["intercom"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
