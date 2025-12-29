import type {
  Client,
  ScheduleHandle,
  WorkflowHandle,
} from "@temporalio/client";
import { QueryTypes } from "sequelize";

import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import type { ActionLink, CheckFunction } from "@app/types";
import type { ConnectorProvider } from "@app/types";
import {
  getZendeskGarbageCollectionWorkflowId,
  getZendeskSyncWorkflowId,
  googleDriveIncrementalSyncWorkflowId,
  makeConfluenceSyncWorkflowId,
  makeGongSyncScheduleId,
  makeIntercomConversationScheduleId,
  makeIntercomHelpCenterScheduleId,
  microsoftGarbageCollectionWorkflowId,
  microsoftIncrementalSyncWorkflowId,
} from "@app/types";

interface ConnectorBlob {
  id: number;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

interface ProviderCheck {
  type: "workflow" | "schedule";
  makeIdsFn: (connector: ConnectorBlob) => string[];
}

const providersToCheck: Partial<Record<ConnectorProvider, ProviderCheck>> = {
  confluence: {
    type: "workflow",
    makeIdsFn: (connector: ConnectorBlob) => [
      makeConfluenceSyncWorkflowId(connector.id),
    ],
  },
  google_drive: {
    type: "workflow",
    makeIdsFn: (connector: ConnectorBlob) => [
      googleDriveIncrementalSyncWorkflowId(connector.id),
    ],
  },
  microsoft: {
    type: "workflow",
    makeIdsFn: (connector: ConnectorBlob) => [
      microsoftIncrementalSyncWorkflowId(connector.id),
      microsoftGarbageCollectionWorkflowId(connector.id),
    ],
  },
  zendesk: {
    type: "workflow",
    makeIdsFn: (connector: ConnectorBlob) => [
      getZendeskSyncWorkflowId(connector.id),
      getZendeskGarbageCollectionWorkflowId(connector.id),
    ],
  },
  gong: {
    type: "schedule",
    makeIdsFn: (connector: ConnectorBlob) => [
      makeGongSyncScheduleId(connector.id),
    ],
  },
  intercom: {
    type: "schedule",
    makeIdsFn: (connector: ConnectorBlob) => [
      makeIntercomHelpCenterScheduleId(connector.id),
      makeIntercomConversationScheduleId(connector.id),
    ],
  },
};

async function listAllConnectorsForProvider(provider: ConnectorProvider) {
  const connectors: ConnectorBlob[] =
    await getConnectorsPrimaryDbConnection().query(
      `SELECT id, "dataSourceId", "workspaceId", "pausedAt" FROM connectors WHERE "type" = :provider and  "errorType" IS NULL`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          provider,
        },
      }
    );

  return connectors;
}

async function areTemporalEntitiesActive(
  client: Client,
  connector: ConnectorBlob,
  info: ProviderCheck
) {
  const ids = info.makeIdsFn(connector);

  switch (info.type) {
    case "workflow": {
      for (const workflowId of ids) {
        try {
          const workflowHandle: WorkflowHandle =
            client.workflow.getHandle(workflowId);

          const descriptions = await Promise.all([workflowHandle.describe()]);

          if (descriptions.some(({ status: { name } }) => name !== "RUNNING")) {
            return false;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          return false;
        }
      }
      break;
    }
    case "schedule": {
      for (const scheduleId of ids) {
        try {
          const scheduleHandle: ScheduleHandle =
            client.schedule.getHandle(scheduleId);

          const description = await scheduleHandle.describe();

          if (description.state.paused) {
            return false;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
          return false;
        }
      }
    }
  }

  return true;
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

    const client = await getTemporalClientForConnectorsNamespace();

    const missingActiveWorkflows: any[] = [];
    for (const connector of connectors) {
      if (connector.pausedAt) {
        continue;
      }
      heartbeat();

      const isActive = await areTemporalEntitiesActive(client, connector, info);

      if (!isActive) {
        missingActiveWorkflows.push({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
          dataSourceId: connector.dataSourceId,
        });
      }
    }

    if (missingActiveWorkflows.length > 0) {
      const actionLinks: ActionLink[] = missingActiveWorkflows.map((c) => ({
        label: `${provider}: ${c.dataSourceId}`,
        url: `/poke/${c.workspaceId}/data_sources/${c.dataSourceId}`,
      }));
      reportFailure(
        { missingActiveWorkflows, actionLinks },
        `Missing ${provider} temporal workflows.`
      );
    } else {
      reportSuccess({ actionLinks: [] });
    }
  }
};
