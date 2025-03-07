import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import type { ZendeskConfigurationModel } from "@connectors/lib/models/zendesk";
import { ZendeskTimestampCursorModel } from "@connectors/lib/models/zendesk";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

export class ZendeskConnectorStrategy
  implements ConnectorProviderStrategy<"zendesk">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<ZendeskConfigurationModel>,
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
    /// deleting every resource in an order that avoids foreign key constraints
    await ZendeskTicketResource.deleteByConnectorId(connector.id, transaction);
    await ZendeskArticleResource.deleteByConnectorId(connector.id, transaction);
    await ZendeskCategoryResource.deleteByConnectorId(
      connector.id,
      transaction
    );
    await ZendeskBrandResource.deleteByConnectorId(connector.id, transaction);
    await ZendeskTimestampCursorModel.destroy({
      where: { connectorId: connector.id },
      transaction,
    });
    await ZendeskConfigurationResource.deleteByConnectorId(
      connector.id,
      transaction
    );
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
