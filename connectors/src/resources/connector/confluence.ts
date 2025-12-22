import type { Transaction } from "sequelize";

import {
  ConfluenceConfigurationModel,
  ConfluenceFolderModel,
  ConfluencePageModel,
  ConfluenceSpaceModel,
} from "@connectors/lib/models/confluence";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class ConfluenceConnectorStrategy implements ConnectorProviderStrategy<"confluence"> {
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<ConfluenceConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["confluence"] | null> {
    await ConfluenceConfigurationModel.create(
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
    await ConfluenceConfigurationModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await ConfluenceSpaceModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await ConfluenceFolderModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await ConfluencePageModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["confluence"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
