import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getConnectorReplicaDbConnection } from "@app/lib/production_checks/utils";

interface ConnectorBlob {
  id: number;
  type: string;
  createdAt: Date;
  dataSourceName: string;
  workspaceId: string;
  pausedAt: Date | null;
  lastSyncSuccessfulTime: Date | null;
}

const connectorsReplica = getConnectorReplicaDbConnection();

async function listAllConnectors() {
  const connectors: ConnectorBlob[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId", "pausedAt", "lastSyncSuccessfulTime", "createdAt", "type" FROM connectors WHERE "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  return connectors;
}

function isLastSyncSuccessFullLessThanAWeek(connector: ConnectorBlob) {
  const lastSuccessOrStart =
    connector.lastSyncSuccessfulTime || connector.createdAt;

  // if older than a week
  if (Date.now() - lastSuccessOrStart.getTime() > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }
  return true;
}

export const checkConnectorsLastSyncSuccess: CheckFunction = async (
  _checkName,
  _logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const stalledLastSyncConnectors: any[] = [];
  const connectors = await listAllConnectors();
  heartbeat();

  for (const connector of connectors) {
    const isFresh = isLastSyncSuccessFullLessThanAWeek(connector);
    if (!isFresh) {
      stalledLastSyncConnectors.push({
        provider: connector.type,
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        createdAt: connector.createdAt,
        lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime,
      });
    }
  }

  if (stalledLastSyncConnectors.length > 0) {
    reportFailure(
      { stalledLastSyncConnectors },
      `Connectors have not synced in the last week.`
    );
  } else {
    reportSuccess({});
  }
};
