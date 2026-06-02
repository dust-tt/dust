import config from "@app/lib/api/config";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
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
} from "@app/types/connectors/workflows";
import type { ConnectorProvider } from "@app/types/data_source";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Client, ScheduleHandle } from "@temporalio/client";
import chunk from "lodash/chunk";
import { QueryTypes } from "sequelize";

const WORKFLOW_LIST_BATCH_SIZE = 100;

interface ConnectorBlob {
  id: ModelId;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
}

interface ProviderCheck {
  type: "workflow" | "schedule";
  makeIdsFn: (connector: ConnectorBlob) => string[];
}

interface MissingActiveWorkflow {
  connectorId: ModelId;
  workspaceId: string;
  dataSourceId: string;
  missingEntities: string[];
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
    // biome-ignore lint/plugin/noRawSql: production check uses read replica
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

function makeWorkflowIdsListQuery(workflowIds: string[]): string | null {
  if (workflowIds.length === 0) {
    return null;
  }

  const workflowIdLiterals = workflowIds
    .map((value) => JSON.stringify(value))
    .join(",");

  return `WorkflowId IN (${workflowIdLiterals}) AND ExecutionStatus = "Running"`;
}

async function listRunningWorkflowIds(
  client: Client,
  workflowIds: string[],
  logger: Logger,
  heartbeat: () => void
) {
  const runningWorkflowIds = new Set<string>();

  // Chunking to avoid having a huge IN (id1, id2, ..., idx).
  const workflowIdBatches = chunk(workflowIds, WORKFLOW_LIST_BATCH_SIZE);
  for (const workflowIdBatch of workflowIdBatches) {
    heartbeat();

    try {
      const query = makeWorkflowIdsListQuery(workflowIdBatch);
      if (query === null) {
        continue;
      }

      for await (const workflow of client.workflow.list({
        query,
      })) {
        runningWorkflowIds.add(workflow.workflowId);
      }
    } catch (error) {
      logger.error({ error }, "Failed to list running Temporal workflows.");
    }
  }

  return runningWorkflowIds;
}

// `client.workflow.list` reads from Temporal's visibility store, which is
// eventually consistent and can lag behind the actual workflow state — notably
// for incremental sync workflows that `continueAsNew` on every cycle, where a
// genuinely running workflow can transiently be absent from the visibility
// query. To avoid false positives, re-check any workflow flagged as missing
// against the authoritative mutable state via `describe()`, and only keep the
// ones that truly are not running. This runs only for the (normally tiny) set
// of candidate-missing workflows, so the number of `describe()` calls stays
// bounded and the batched visibility query remains the fast path.
async function confirmRunningWorkflowIds(
  client: Client,
  workflowIds: string[],
  logger: Logger,
  heartbeat: () => void
) {
  const runningWorkflowIds = new Set<string>();

  // External Temporal calls (not DB queries), so concurrentExecutor is the
  // right fit here.
  await concurrentExecutor(
    workflowIds,
    async (workflowId) => {
      heartbeat();

      try {
        const description = await client.workflow
          .getHandle(workflowId)
          .describe();
        if (description.status.name === "RUNNING") {
          runningWorkflowIds.add(workflowId);
        }
      } catch (err) {
        // `describe()` throws when the workflow does not exist; treat as missing.
        logger.info(
          { workflowId, err: normalizeError(err) },
          "Workflow not found while confirming missing Temporal workflow."
        );
      }
    },
    { concurrency: 8 }
  );

  return runningWorkflowIds;
}

async function getMissingTemporalSchedulesActive(
  client: Client,
  connector: ConnectorBlob,
  info: ProviderCheck
) {
  const missingEntities: string[] = [];

  for (const scheduleId of info.makeIdsFn(connector)) {
    try {
      const scheduleHandle: ScheduleHandle =
        client.schedule.getHandle(scheduleId);

      const description = await scheduleHandle.describe();

      if (description.state.paused) {
        missingEntities.push(scheduleId);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
    } catch (err) {
      missingEntities.push(scheduleId);
    }
  }

  return missingEntities;
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

    let missingActiveWorkflows: MissingActiveWorkflow[] = [];

    const activeConnectors = connectors.filter(
      (connector) => !connector.pausedAt
    );

    switch (info.type) {
      case "workflow": {
        const workflowIdsByConnector = activeConnectors.map((connector) => ({
          connector,
          workflowIds: info.makeIdsFn(connector),
        }));
        const workflowIds = workflowIdsByConnector.flatMap(
          ({ workflowIds }) => workflowIds
        );
        const runningWorkflowIds = await listRunningWorkflowIds(
          client,
          workflowIds,
          logger,
          heartbeat
        );

        // Workflows the visibility query did not return are only *candidates*
        // for being missing — confirm them against the authoritative mutable
        // state before reporting, to avoid false positives from visibility lag.
        const candidateMissingWorkflowIds = workflowIds.filter(
          (workflowId) => !runningWorkflowIds.has(workflowId)
        );
        const confirmedRunningWorkflowIds = await confirmRunningWorkflowIds(
          client,
          candidateMissingWorkflowIds,
          logger,
          heartbeat
        );

        missingActiveWorkflows = removeNulls(
          workflowIdsByConnector.map(({ connector, workflowIds }) => {
            const missingEntities = workflowIds.filter(
              (workflowId) =>
                !runningWorkflowIds.has(workflowId) &&
                !confirmedRunningWorkflowIds.has(workflowId)
            );

            return missingEntities.length > 0
              ? {
                  connectorId: connector.id,
                  workspaceId: connector.workspaceId,
                  dataSourceId: connector.dataSourceId,
                  missingEntities,
                }
              : null;
          })
        );
        break;
      }
      case "schedule": {
        for (const connector of activeConnectors) {
          heartbeat();

          const missingEntities = await getMissingTemporalSchedulesActive(
            client,
            connector,
            info
          );

          if (missingEntities.length > 0) {
            missingActiveWorkflows.push({
              connectorId: connector.id,
              workspaceId: connector.workspaceId,
              dataSourceId: connector.dataSourceId,
              missingEntities,
            });
          }
        }
        break;
      }
    }

    if (missingActiveWorkflows.length > 0) {
      const actionLinks: ActionLink[] = missingActiveWorkflows.map((c) => ({
        label: `${provider}: ${c.dataSourceId}`,
        url: `${config.getPokeAppUrl()}/${c.workspaceId}/data_sources/${c.dataSourceId}`,
      }));
      reportFailure(
        { missingActiveWorkflows, actionLinks },
        `Missing ${provider} temporal workflows.`
      );
    } else {
      reportSuccess();
    }
  }
};
