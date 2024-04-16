import { getNotionWorkflowId } from "@dust-tt/types";
import type { Client, WorkflowHandle } from "@temporalio/client";
import { QueryTypes } from "sequelize";

import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";
import { getConnectorReplicaDbConnection } from "@app/production_checks/lib/utils";
import type { CheckFunction } from "@app/production_checks/types/check";

interface NotionConnector {
  id: number;
  dataSourceName: string;
  workspaceId: string;
  pausedAt: Date | null;
}

async function listAllNotionConnectors() {
  const connectorsReplica = getConnectorReplicaDbConnection();

  const notionConnectors: NotionConnector[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId", "pausedAt" FROM connectors WHERE "type" = 'notion' and  "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  return notionConnectors;
}

async function areTemporalWorkflowsRunning(
  client: Client,
  notionConnector: NotionConnector
) {
  try {
    const incrementalSyncHandle: WorkflowHandle = client.workflow.getHandle(
      getNotionWorkflowId(notionConnector, "never")
    );
    const garbageCollectorHandle: WorkflowHandle = client.workflow.getHandle(
      getNotionWorkflowId(notionConnector, "always")
    );

    const descriptions = await Promise.all([
      incrementalSyncHandle.describe(),
      garbageCollectorHandle.describe(),
    ]);

    const histories = await Promise.all([
      incrementalSyncHandle.fetchHistory(),
      garbageCollectorHandle.fetchHistory(),
    ]);

    const latests: (Date | null)[] = histories.map((h) => {
      let latest: Date | null = null;
      if (h.events) {
        h.events.forEach((e) => {
          if (e.eventTime?.seconds) {
            // @ts-expect-error eventTime is Long and it works
            const d = new Date(e.eventTime?.seconds * 1000);
            if (!latest || d > latest) {
              latest = d;
            }
          }
        });
      }
      return latest;
    });

    return {
      isRunning: descriptions.every(
        ({ status: { name } }) => name === "RUNNING"
      ),
      isNotStalled: latests.every(
        // Check `latest` is less than 1h old.
        (d) => d && new Date().getTime() - d.getTime() < 60 * 60 * 1000
      ),
    };
  } catch (err) {
    return { isRunning: false, isNotStalled: false };
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

    const { isRunning, isNotStalled } = await areTemporalWorkflowsRunning(
      client,
      notionConnector
    );

    if (!isRunning) {
      missingActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
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
