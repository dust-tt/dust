import type { Client } from "@temporalio/client";
import type pino from "pino";
import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { getNotionWorkflowId } from "@app/types";
import { withRetries } from "@app/types";

interface NotionConnector {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

async function listAllNotionConnectors() {
  const connectorsDb = getConnectorsPrimaryDbConnection();

  const notionConnectors: NotionConnector[] = await connectorsDb.query(
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
  logger,
}: {
  client: Client;
  notionConnector: NotionConnector;
  logger: pino.Logger;
}) {
  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieving Notion handles"
  );
  const incrementalSyncHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, "sync")
  );
  const garbageCollectorHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, "garbage-collector")
  );
  const processDatabaseUpsertQueueHandle = client.workflow.getHandle(
    getNotionWorkflowId(notionConnector.id, "process-database-upsert-queue")
  );

  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieved Notion handles"
  );

  const descriptions = await Promise.all([
    incrementalSyncHandle.describe(),
    garbageCollectorHandle.describe(),
    processDatabaseUpsertQueueHandle.describe(),
  ]);
  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieved descriptions"
  );

  const histories = await Promise.all([
    incrementalSyncHandle.fetchHistory(),
    garbageCollectorHandle.fetchHistory(),
    processDatabaseUpsertQueueHandle.fetchHistory(),
  ]);
  logger.info(
    {
      connectorId: notionConnector.id,
    },
    "Retrieved histories"
  );

  return {
    descriptions,
    histories,
  };
}

async function areTemporalWorkflowsRunning(
  client: Client,
  notionConnector: NotionConnector,
  logger: pino.Logger
) {
  try {
    const { descriptions, histories } = await withRetries(
      logger,
      getDescriptionsAndHistories,
      { retries: 10 }
    )({
      client,
      notionConnector,
      logger,
    });

    logger.info(
      {
        connectorId: notionConnector.id,
      },
      "getDescriptionsAndHistories completed"
    );

    const latests: (Date | null)[] = histories.map((h) => {
      let latest: Date | null = null;
      if (h.events) {
        h.events.forEach((e) => {
          if (e.eventTime?.seconds) {
            const d = new Date(Number(e.eventTime.seconds) * 1000);
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

  const client = await getTemporalClientForConnectorsNamespace();

  logger.info(`Found ${notionConnectors.length} Notion connectors.`);

  const missingActiveWorkflows: any[] = [];
  const stalledWorkflows: any[] = [];

  for (const notionConnector of notionConnectors) {
    if (notionConnector.pausedAt) {
      continue;
    }
    heartbeat();

    const { isRunning, isNotStalled, details } =
      await areTemporalWorkflowsRunning(client, notionConnector, logger);

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
