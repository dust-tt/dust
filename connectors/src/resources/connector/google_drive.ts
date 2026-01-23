import type { Transaction } from "sequelize";

import {
  GoogleDriveConfigModel,
  GoogleDriveFilesModel,
  GoogleDriveFoldersModel,
  GoogleDriveSheetModel,
  GoogleDriveSyncTokenModel,
} from "@connectors/lib/models/google_drive";
import type {
  ConnectorProviderConfigurationType,
  ConnectorProviderModelResourceMapping,
  ConnectorProviderStrategy,
  WithCreationAttributes,
} from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export class GoogleDriveConnectorStrategy implements ConnectorProviderStrategy<"google_drive"> {
  async makeNew(
    connectorId: ModelId,
    blob: WithCreationAttributes<GoogleDriveConfigModel>,
    transaction: Transaction
  ): Promise<ConnectorProviderModelResourceMapping["google_drive"] | null> {
    await GoogleDriveConfigModel.create(
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
    await GoogleDriveFoldersModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveFilesModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveSheetModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });

    await GoogleDriveSyncTokenModel.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveConfigModel.destroy({
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
