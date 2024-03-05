import { QueryTypes } from "sequelize";

import { getConnectorReplicaDbConnection } from "@app/production_checks/lib/utils";
import type { CheckFunction } from "@app/production_checks/types/check";

export const managedDataSourceGdriveWebhooksCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const connectorsSequelize = getConnectorReplicaDbConnection();
  heartbeat();

  const gdriveConnectionsWithoutWebhooks: {
    id: number;
    dataSourceName: string;
    workspaceId: string;
  }[] = await connectorsSequelize.query(
    `SELECT c.id, c."dataSourceName", c."workspaceId" FROM connectors c LEFT JOIN google_drive_webhooks gdw ON c.id = gdw."connectorId" WHERE c."dataSourceName" = 'managed-google_drive' GROUP BY c.id HAVING COUNT(gdw.id) = 0`,
    { type: QueryTypes.SELECT }
  );
  heartbeat();

  if (gdriveConnectionsWithoutWebhooks.length > 0) {
    reportFailure(
      { gdriveConnectionsWithoutWebhooks },
      "Google Drive connectors are missing GoogleDriveWebhook records"
    );
  } else {
    reportSuccess({});
  }
};
