import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class ConfluenceConnectorStrategy
  implements ConnectorProviderStrategy<"confluence">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<ConfluenceConfiguration>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["confluence"] | null> {
    await ConfluenceConfiguration.create(
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
      ConfluenceConfiguration.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      ConfluenceSpace.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
      ConfluencePage.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);
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
