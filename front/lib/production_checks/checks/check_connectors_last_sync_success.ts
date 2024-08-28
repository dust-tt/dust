import type { ConnectorProvider } from "@dust-tt/types";
import { isWebhookBasedProvider } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getConnectorReplicaDbConnection } from "@app/lib/production_checks/utils";

interface ConnectorBlob {
  id: number;
  type: ConnectorProvider;
  createdAt: Date;
  dataSourceName: string;
  workspaceId: string;
  pausedAt: Date | null;
  lastSyncSuccessfulTime: Date | null;
  lastSyncStartTime: Date | null;
}

const connectorsReplica = getConnectorReplicaDbConnection();

async function listAllConnectors() {
  const connectors: ConnectorBlob[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId", "pausedAt", "lastSyncSuccessfulTime", "lastSyncStartTime", "createdAt", "type" FROM connectors WHERE "errorType" IS NULL AND "pausedAt" IS NULL AND "type" <> 'webcrawler'`,
    {
      type: QueryTypes.SELECT,
    }
  );
  return connectors;
}

function isLastSyncSuccessfullOrStartLessFresh(connector: ConnectorBlob) {
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  // If we have a lastSyncSuccessfulTime and it's less than a week old then we're good.
  if (
    connector.lastSyncSuccessfulTime &&
    Date.now() - connector.lastSyncSuccessfulTime.getTime() < oneWeek
  ) {
    return true;
  }

  // If the last sync started less than a week ago, we're good.
  if (
    connector.lastSyncStartTime &&
    Date.now() - connector.lastSyncStartTime.getTime() < oneWeek
  ) {
    return true;
  }

  // If the connector was created less than a week ago, we're good.
  if (Date.now() - connector.createdAt.getTime() < oneWeek) {
    return true;
  }

  return false;
}

export const checkConnectorsLastSyncSuccess: CheckFunction = async (
  _checkName,
  _logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const stalledLastSyncConnectors: any[] = [];
  const connectors = (await listAllConnectors()).filter(
    (connector) =>
      // Ignore webhook-based connectors and webcrawlers
      !isWebhookBasedProvider(connector.type) && connector.type !== "webcrawler"
  );
  heartbeat();

  for (const connector of connectors) {
    const isFresh = isLastSyncSuccessfullOrStartLessFresh(connector);
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
