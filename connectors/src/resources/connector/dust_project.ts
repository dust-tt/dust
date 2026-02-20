import { DustProjectConfigurationModel } from "@connectors/lib/models/dust_project";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { DustProjectConfigurationResource } from "@connectors/resources/dust_project_configuration_resource";
import { DustProjectConversationResource } from "@connectors/resources/dust_project_conversation_resource";
import type { ModelId } from "@connectors/types";
import type { Transaction } from "sequelize";

export class DustProjectConnectorStrategy
  implements ConnectorProviderStrategy<"dust_project">
{
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<DustProjectConfigurationModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["dust_project"] | null> {
    return DustProjectConfigurationResource.makeNew({
      connectorId,
      projectId: blob.projectId,
      transaction,
    });
  }

  async delete(
    connector: ConnectorResource,
    transaction: Transaction
  ): Promise<void> {
    await DustProjectConversationResource.deleteByConnector(
      connector,
      transaction
    );
    await DustProjectConfigurationModel.destroy({
      where: { connectorId: connector.id },
      transaction,
    });
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["dust_project"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
