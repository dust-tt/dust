import type { Transaction } from "sequelize";

import type { SalesforceConfigurationModel } from "@connectors/lib/models/salesforce";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

import {
  SalesforceConfigurationResource,
  SalesforceSyncedQueryResource,
} from "../salesforce_resources";

export class SalesforceConnectorStrategy implements ConnectorProviderStrategy<"salesforce"> {
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<SalesforceConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["salesforce"] | null> {
    await SalesforceConfigurationResource.makeNew({
      blob: { ...blob, connectorId },
      transaction,
    });

    return null;
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    const config = await SalesforceConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (!config) {
      throw new Error(
        `Salesforce configuration not found for connector ${connector.id}`
      );
    }
    await config.delete(transaction);

    const delRes = await SalesforceSyncedQueryResource.deleteByConnectorId(
      connector.id,
      transaction
    );
    if (!delRes) {
      throw new Error(
        `Failed to delete Salesforce synced queries for connector ${connector.id}`
      );
    }

    return;
  }

  async fetchConfigurationsbyConnectorIds(
    connectorIds: ModelId[]
  ): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["salesforce"]>
  > {
    return SalesforceConfigurationResource.fetchByConnectorIds(connectorIds);
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
