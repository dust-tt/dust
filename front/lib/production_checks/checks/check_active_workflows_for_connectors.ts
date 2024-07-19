import type { ConnectorProvider } from "@dust-tt/types";
import { microsoftIncrementalSyncWorkflowId } from "@dust-tt/types";
import {
  getIntercomSyncWorkflowId,
  googleDriveIncrementalSyncWorkflowId,
  makeConfluenceSyncWorkflowId,
} from "@dust-tt/types";
import type { Client, WorkflowHandle } from "@temporalio/client";
import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getConnectorReplicaDbConnection } from "@app/lib/production_checks/utils";
import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";

interface ConnectorBlob {
  id: number;
  dataSourceName: string;
  workspaceId: string;
  pausedAt: Date | null;
}

interface ProviderCheck {
  makeIdFn: (connector: ConnectorBlob) => string;
}

const connectorsReplica = getConnectorReplicaDbConnection();

const providersToCheck: Partial<Record<ConnectorProvider, ProviderCheck>> = {
  confluence: {
    makeIdFn: (connector: ConnectorBlob) =>
      makeConfluenceSyncWorkflowId(connector.id),
  },
  intercom: {
    makeIdFn: (connector: ConnectorBlob) =>
      getIntercomSyncWorkflowId(connector.id),
  },
  google_drive: {
    makeIdFn: (connector: ConnectorBlob) =>
      googleDriveIncrementalSyncWorkflowId(connector.id),
  },
  microsoft: {
    makeIdFn: (connector: ConnectorBlob) =>
      microsoftIncrementalSyncWorkflowId(connector.id),
  },
};

async function listAllConnectorsForProvider(provider: ConnectorProvider) {
  const connectors: ConnectorBlob[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId", "pausedAt" FROM connectors WHERE "type" = :provider and  "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        provider,
      },
    }
  );

  return connectors;
}

async function areTemporalWorkflowsRunning(
  client: Client,
  connector: ConnectorBlob,
  info: ProviderCheck
) {
  try {
    const workflowHandle: WorkflowHandle = client.workflow.getHandle(
      info.makeIdFn(connector)
    );

    const descriptions = await Promise.all([workflowHandle.describe()]);

    return descriptions.every(({ status: { name } }) => name === "RUNNING");
  } catch (err) {
    return false;
  }
}

export const checkActiveWorkflows: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  for (const [provider, info] of Object.entries(providersToCheck)) {
    const connectors = await listAllConnectorsForProvider(
      provider as ConnectorProvider
    );

    logger.info(`Found ${connectors.length} ${provider} connectors.`);

    const client = await getTemporalConnectorsNamespaceConnection();

    const missingActiveWorkflows: any[] = [];
    for (const connector of connectors) {
      if (connector.pausedAt) {
        continue;
      }
      heartbeat();

      const isActive = await areTemporalWorkflowsRunning(
        client,
        connector,
        info
      );
      if (!isActive) {
        missingActiveWorkflows.push({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
        });
      }
    }

    if (missingActiveWorkflows.length > 0) {
      reportFailure(
        { missingActiveWorkflows },
        `Missing ${provider} temporal workflows.`
      );
    } else {
      reportSuccess({});
    }
  }
};
