import type { CreationAttributes, Transaction } from "sequelize";

import { GoogleDriveConfig } from "@connectors/lib/models/google_drive";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
} from "@connectors/lib/models/google_drive";
import type { ConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export class GoogleDriveConnectorStrategy implements ConnectorProviderStrategy {
  async makeNew(
    connector: ConnectorResource,
    blob: CreationAttributes<GoogleDriveConfig>,
    transaction: Transaction
  ): Promise<void> {
    await GoogleDriveConfig.create(
      {
        ...blob,
        connectorId: connector.id,
      },
      { transaction }
    );
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

    await GoogleDriveSyncToken.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
    await GoogleDriveWebhook.destroy({
      where: {
        connectorId: connector.id,
      },
      transaction,
    });
  }
}
