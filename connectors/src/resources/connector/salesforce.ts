import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class SalesforceConnectorStrategy
  implements ConnectorProviderStrategy<"salesforce">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<SalesforceConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["salesforce"] | null> {
    await SalesforceConfigurationModel.create(
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
    await SalesforceConfigurationModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["salesforce"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
