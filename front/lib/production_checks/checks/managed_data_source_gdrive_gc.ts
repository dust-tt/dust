import { getCoreDocuments } from "@app/lib/production_checks/managed_ds";
import {
  getConnectorsReplicaDbConnection,
  getFrontReplicaDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { googleDriveGarbageCollectorWorkflowId } from "@app/types/connectors/workflows";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { withRetries } from "@app/types/shared/retries";
import type { Client } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";
import type { Logger } from "pino";
import { QueryTypes } from "sequelize";

// Below this share of a data source's documents, a non-empty GC backlog is treated as
// benign lag between GC runs rather than a GC failure.
const NOT_DELETED_RATIO_THRESHOLD = 0.05;

async function isGarbageCollectorRunning(
  client: Client,
  connectorId: string,
  logger: Logger
): Promise<boolean> {
  try {
    const handle = client.workflow.getHandle(
      googleDriveGarbageCollectorWorkflowId(parseInt(connectorId, 10))
    );
    const description = await handle.describe();
    return description.status.name === "RUNNING";
  } catch (err) {
    if (!(err instanceof WorkflowNotFoundError)) {
      logger.error(
        { error: err, connectorId },
        "Failed to describe Google Drive garbage collector workflow."
      );
    }
    return false;
  }
}

export const managedDataSourceGCGdriveCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const connectorsReplica = getConnectorsReplicaDbConnection();
  const frontReplica = getFrontReplicaDbConnection();
  const GdriveDataSources: {
    id: number;
    connectorId: string;
    workspaceModelId: number;
    workspaceId: string;
  }[] =
    // biome-ignore lint/plugin/noRawSql: Leggit
    await frontReplica.query(
      `SELECT ds.id, ds."connectorId", ds."workspaceId" AS "workspaceModelId", w."sId" AS "workspaceId"
       FROM data_sources ds
       INNER JOIN workspaces w ON w.id = ds."workspaceId"
       WHERE ds."connectorProvider" = 'google_drive'`,
      { type: QueryTypes.SELECT }
    );

  if (GdriveDataSources.length === 0) {
    reportSuccess({ message: "No Google Drive data sources to check" });
    return;
  }

  const temporalClient = await getTemporalClientForConnectorsNamespace();

  const CONCURRENCY = 8;
  await concurrentExecutor(
    GdriveDataSources,
    async (ds) => {
      logger.info(
        {
          reportPayload: {
            connectorId: ds.connectorId,
          },
        },
        "Check started"
      );
      heartbeat();

      // Retrieve all documents from the connector (first) in batches using an id cursor
      const BATCH_SIZE = 1_000;
      let lastId = 0;
      const connectorDocuments: { id: number; coreDocumentId: string }[] = [];
      let fetched = 0;
      do {
        // There is a risk of "cancelling statement due to conflict with recovery" errors
        // relatively benign in the context of this check, thus the retry policy.
        const batch = (await withRetries(
          logger,
          async () =>
            // biome-ignore lint/plugin/noRawSql: production check uses read replica
            connectorsReplica.query(
              'SELECT id, "dustFileId" as "coreDocumentId" FROM google_drive_files WHERE "connectorId" = :connectorId AND id > :lastId ORDER BY id ASC LIMIT :batchSize',
              {
                replacements: {
                  connectorId: ds.connectorId,
                  lastId,
                  batchSize: BATCH_SIZE,
                },
                type: QueryTypes.SELECT,
              }
            ),
          {
            retries: 8,
            delayBetweenRetriesMs: 4000,
          }
        )({})) as { id: number; coreDocumentId: string }[];

        fetched = batch.length;
        if (fetched > 0) {
          connectorDocuments.push(...batch);
          lastId = batch[fetched - 1].id;
          heartbeat();
        }
      } while (fetched === BATCH_SIZE);

      const connectorDocumentIds = new Set(
        connectorDocuments.map((d) => d.coreDocumentId)
      );

      // Retrieve all documents from the connector (second). We retrieve in this order to avoid race
      // conditions where a document would get deleted after we retrieve the core documents but before
      // we retrieve the connectors documents. This would cause the check to fail. In the order we use
      // here the check won't fail.
      const coreDocumentsRes = await getCoreDocuments(ds.id);
      if (coreDocumentsRes.isErr()) {
        reportFailure(
          { frontDataSourceId: ds.id, actionLinks: [] },
          "Could not get core documents"
        );
        return;
      }
      const coreDocuments = coreDocumentsRes.value;
      const coreDocumentIds = coreDocuments.map((d) => d.document_id);

      const notDeleted = coreDocumentIds.filter(
        (coreId) => !connectorDocumentIds.has(coreId)
      );
      if (notDeleted.length === 0) {
        reportSuccess();
        return;
      }

      const notDeletedRatio = notDeleted.length / coreDocumentIds.length;
      if (notDeletedRatio <= NOT_DELETED_RATIO_THRESHOLD) {
        reportSuccess({
          message: `${notDeleted.length} document${notDeleted.length > 1 ? "s" : ""} awaiting GC out of ${coreDocumentIds.length} (below ${NOT_DELETED_RATIO_THRESHOLD * 100}% threshold, connector: ${ds.connectorId})`,
        });
        return;
      }

      // The backlog is expected while the garbage collector is processing it: only fire
      // when no GC workflow is currently running for this connector.
      if (
        await isGarbageCollectorRunning(temporalClient, ds.connectorId, logger)
      ) {
        reportSuccess({
          message: `${notDeleted.length} document${notDeleted.length > 1 ? "s" : ""} awaiting GC but the garbage collector is currently running (connector: ${ds.connectorId})`,
        });
        return;
      }

      const dataSourceId = DataSourceResource.modelIdToSId({
        id: ds.id,
        workspaceId: ds.workspaceModelId,
      });
      const actionLinks: ActionLink[] = [
        {
          label: `${notDeleted.length} document${notDeleted.length > 1 ? "s" : ""} not GC'd (connector: ${ds.connectorId})`,
          url: `/poke/${ds.workspaceId}/data_sources/${dataSourceId}`,
        },
      ];
      reportFailure(
        {
          notDeleted,
          coreDocumentCount: coreDocumentIds.length,
          connectorId: ds.connectorId,
          actionLinks,
        },
        "Google Drive documents not properly Garbage collected"
      );
    },
    { concurrency: CONCURRENCY }
  );
};
