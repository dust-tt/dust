import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import type { ZendeskConfiguration } from "@connectors/lib/models/zendesk";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";

export class ZendeskConnectorStrategy
  implements ConnectorProviderStrategy<"zendesk">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<ZendeskConfiguration>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["zendesk"] | null> {
    await ZendeskConfigurationResource.makeNew({
      blob: { ...blob, connectorId },
      transaction,
    });
    return null;
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const config = await ZendeskConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!config) {
      throw new Error(
        `Zendesk configuration not found for connector ${connector.id}`
      );
    }
    await config.delete(transaction);
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
