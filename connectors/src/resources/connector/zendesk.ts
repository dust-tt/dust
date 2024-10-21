import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import { ZendeskConfiguration } from "@connectors/lib/models/zendesk";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class ZendeskConnectorStrategy
  implements ConnectorProviderStrategy<"zendesk">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<ZendeskConfiguration>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["zendesk"] | null> {
    await ZendeskConfiguration.create(
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
      ZendeskConfiguration.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction,
      }),
    ]);
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["zendesk"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
