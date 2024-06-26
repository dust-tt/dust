import type { ModelId } from "@dust-tt/types";
import type { Transaction } from "sequelize";

import {
  GoogleDriveConfig,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
} from "@connectors/lib/models/google_drive";
import type {
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
  }

  async fetchConfigurationsbyConnectorIds(): Promise<
    Record<ModelId, ConnectorProviderModelResourceMapping["google_drive"]>
  > {
    return {};
  }
}
