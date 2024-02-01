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
}

async function listAllNotionConnectors() {
  const connectorsReplica = getConnectorReplicaDbConnection();

  const notionConnectors: NotionConnector[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId" FROM connectors WHERE "type" = 'notion' and  "errorType" IS NULL`,
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

    return descriptions.every(({ status: { name } }) => name === "RUNNING");
  } catch (err) {
    return false;
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
  for (const notionConnector of notionConnectors) {
    heartbeat();

    const isActive = await areTemporalWorkflowsRunning(client, notionConnector);
    if (!isActive) {
      missingActiveWorkflows.push({
        connectorId: notionConnector.id,
        workspaceId: notionConnector.workspaceId,
      });
    }
  }

  if (missingActiveWorkflows.length > 0) {
    reportFailure(
      { missingActiveWorkflows },
      "Missing Notion temporal workflows"
    );
  } else {
    reportSuccess({});
  }
};
