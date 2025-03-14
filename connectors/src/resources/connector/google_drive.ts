import type { Transaction } from "sequelize";

import {
  GoogleDriveConfig,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSheet,
  GoogleDriveSyncToken,
} from "@connectors/lib/models/google_drive";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class GoogleDriveConnectorStrategy
  implements ConnectorProviderStrategy<"google_drive">
{
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<GoogleDriveConfig>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["google_drive"] | null> {
    await GoogleDriveConfig.create(
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
    await GoogleDriveFolders.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveFiles.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveSheet.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });

    await GoogleDriveSyncToken.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveConfig.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["google_drive"]>
  > {
    return {};
  }

  configurationJSON(): ConnectorProviderConfigurationType {
    return null;
  }
}
