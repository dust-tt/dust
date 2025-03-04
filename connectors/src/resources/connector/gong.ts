import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import { GongConfigurationModel } from "@connectors/lib/models/gong";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class GongConnectorStrategy
  implements ConnectorProviderStrategy<"gong">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<GongConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["gong"] | null> {
    await GongConfigurationModel.create(
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
    await GongConfigurationModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["gong"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
