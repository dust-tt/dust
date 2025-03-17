import type { Client } from "@temporalio/client";
import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";
import type { ConnectorProvider } from "@app/types";

interface ConnectorBlob {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  type: ConnectorProvider;
  pausedAt: Date | null;
}

const connectorsDb = getConnectorsPrimaryDbConnection();

async function listPausedConnectors() {
  const connectors: ConnectorBlob[] = await connectorsDb.query(
    `SELECT id, "dataSourceId", "workspaceId", "pausedAt", "type" FROM connectors WHERE "pausedAt" IS NOT NULL AND "type" != 'webcrawler' and "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  return connectors;
}

async function areTemporalWorkflowsRunning(
  client: Client,
  connector: ConnectorBlob
) {
  try {
    const workflowInfos = client.workflow.list({
      query: `ExecutionStatus = 'Running' AND connectorId = ${connector.id}`,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of workflowInfos) {
      // workflowInfos is an async iterable, so we need to consume it to actually get the results
      return true;
    }
    return false;
  } catch (err) {
    return true;
  }
}

export const checkExtraneousWorkflows: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const connectors = await listPausedConnectors();

  logger.info(`Found ${connectors.length} paused connectors.`);

  const client = await getTemporalConnectorsNamespaceConnection();

  const hasExtraneousWorklows: any[] = [];
  for (const connector of connectors) {
    heartbeat();

    const isActive = await areTemporalWorkflowsRunning(client, connector);
    if (isActive) {
      hasExtraneousWorklows.push({
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        dataSourceId: connector.dataSourceId,
        provider: connector.type,
      });
    }
  }

  if (hasExtraneousWorklows.length > 0) {
    reportFailure(
      { hasExtraneousWorklows },
      `Extraneous temporal workflows (connector is paused but workflows are running). Potential resolution: unpause the connector.`
    );
  } else {
    reportSuccess({});
  }
};
