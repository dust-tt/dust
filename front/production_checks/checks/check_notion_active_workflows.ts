import { Client, WorkflowHandle } from "@temporalio/client";
import { QueryTypes } from "sequelize";

import { getTemporalClient } from "@app/lib/temporal";
import { getConnectorReplicaDbConnection } from "@app/production_checks/lib/utils";
import { CheckFunction } from "@app/production_checks/types/check";

interface NotionConnector {
  id: number;
  dataSourceName: string;
  workspaceId: string;
}

export function getWorkflowId(dataSourceInfo: {
  workspaceId: string;
  dataSourceName: string;
}) {
  return `workflow-notion-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

async function listAllNotionConnectors() {
  const connectorsReplica = getConnectorReplicaDbConnection();

  const notionConnectors: NotionConnector[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId" FROM connectors WHERE "type" = 'notion'`,
    {
      type: QueryTypes.SELECT,
    }
  );

  return notionConnectors;
}

async function isTemporalWorkflowRunning(
  client: Client,
  notionConnector: NotionConnector
) {
  try {
    const handle: WorkflowHandle = client.workflow.getHandle(
      getWorkflowId(notionConnector)
    );

    const description = await handle.describe();
    const { status } = description;

    return status.name === "RUNNING";
  } catch (err) {
    return false;
  }
}

export const checkNotionActiveWorkflows: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const notionConnectors = await listAllNotionConnectors();

  const client = await getTemporalClient();

  const missingActiveWorkflows: any[] = [];
  for (const notionConnector of notionConnectors) {
    heartbeat();

    const isActive = isTemporalWorkflowRunning(client, notionConnector);
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
