import {
  makeConfluenceSyncWorkflowId,
  type ConnectorProvider,
  getIntercomSyncWorkflowId,
} from "@dust-tt/types";
import type { Client, WorkflowHandle } from "@temporalio/client";
import { QueryTypes } from "sequelize";

import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";
import { getConnectorReplicaDbConnection } from "@app/production_checks/lib/utils";
import type { CheckFunction } from "@app/production_checks/types/check";

interface ConnectorBlob {
  id: number;
  dataSourceName: string;
  workspaceId: string;
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
};

async function listAllConnectorsForProvider(provider: ConnectorProvider) {
  const connectors: ConnectorBlob[] = await connectorsReplica.query(
    `SELECT id, "dataSourceName", "workspaceId" FROM connectors WHERE "type" = :provider and  "errorType" IS NULL`,
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
