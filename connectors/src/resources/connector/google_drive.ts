import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import { getSharedWithMeFolderId } from "@connectors/connectors/google_drive/lib/hierarchy";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteDataSourceFolder } from "@connectors/lib/data_sources";
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
    await deleteDataSourceFolder({
      dataSourceConfig: dataSourceConfigFromConnector(connector),
      folderId: getSharedWithMeFolderId(connector),
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
