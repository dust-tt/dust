import { getNotionWorkflowId } from "@dust-tt/types";
import type { Client } from "@temporalio/client";
import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getConnectorReplicaDbConnection } from "@app/lib/production_checks/utils";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";
import { withRetries } from "@app/lib/utils/retries";

interface NotionConnector {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

async function listAllNotionConnectors() {
  const connectorsReplica = getConnectorReplicaDbConnection();

  const notionConnectors: NotionConnector[] = await connectorsReplica.query(
    `SELECT id, "dataSourceId", "workspaceId", "pausedAt" FROM connectors WHERE "type" = 'notion' and  "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  return notionConnectors;
}

async function getDescriptionsAndHistories({
  client,
  notionConnector,
}: {
  client: Client;
  notionConnector: NotionConnector;
}) {
  const incrementalSyncHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, false)
  );
  const garbageCollectorHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, true)
  );

  const descriptions = await Promise.all([
    incrementalSyncHandle.describe(),
    garbageCollectorHandle.describe(),
  ]);

  const histories = await Promise.all([
    incrementalSyncHandle.fetchHistory(),
    garbageCollectorHandle.fetchHistory(),
  ]);

  return {
    descriptions,
    histories,
  };
}

async function areTemporalWorkflowsRunning(
  client: Client,
  notionConnector: NotionConnector
) {
  try {
    const { descriptions, histories } = await withRetries(
      getDescriptionsAndHistories,
      { retries: 10 }
    )({
      client,
      notionConnector,
    });

    const latests: (Date | null)[] = histories.map((h) => {
      let latest: Date | null = null;
      if (h.events) {
        h.events.forEach((e) => {
          if (e.eventTime?.seconds) {
            const d = new Date(e.eventTime?.seconds * 1000);
            if (!latest || d > latest) {
              latest = d;
            }
          }
        });
      }
      return latest;
    });

    const isRunning = descriptions.every(
      ({ status: { name } }) => name === "RUNNING"
    );

    const details = isRunning
      ? ""
      : "Statuses of workflows are " +
        descriptions
          .map(({ status: { name }, workflowId }) => `${workflowId}: ${name}`)
          .join(", ");

    return {
      isRunning,
      isNotStalled: latests.every(
        // Check `latest` is less than 4h old.
        (d) => d && new Date().getTime() - d.getTime() < 4 * 60 * 60 * 1000
      ),
      details,
    };
  } catch (err) {
    return {
      isRunning: false,
      isNotStalled: false,
      details: `Got Error: ${err}`,
    };
  }
}

export const checkNotionActiveWorkflows: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const notionConnectors = await listAllNotionConnectors();

  const client = await getTemporalConnectorsNamespaceConnection();

  logger.info(`Found ${notionConnectors.length} Notion connectors.`);

  const missingActiveWorkflows: any[] = [];
  const stalledWorkflows: any[] = [];

  for (const notionConnector of notionConnectors) {
    if (notionConnector.pausedAt) {
      continue;
    }
    heartbeat();

    const { isRunning, isNotStalled, details } =
      await areTemporalWorkflowsRunning(client, notionConnector);

    if (!isRunning) {
      missingActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
        details,
      });
    } else {
      if (!isNotStalled) {
        stalledWorkflows.push({
          connectorId: notionConnector.id,
          workspaceId: notionConnector.workspaceId,
        });
      }
    }
  }

  if (missingActiveWorkflows.length > 0) {
    reportFailure(
      { missingActiveWorkflows, stalledWorkflows },
      "Missing or stalled Notion temporal workflows"
    );
  } else {
    reportSuccess({});
  }
};
