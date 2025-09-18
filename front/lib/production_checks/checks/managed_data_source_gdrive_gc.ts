import { QueryTypes } from "sequelize";

import { getCoreDocuments } from "@app/lib/production_checks/managed_ds";
import type { CheckFunction } from "@app/lib/production_checks/types";
import {
  getConnectorsReplicaDbConnection,
  getFrontReplicaDbConnection,
} from "@app/lib/production_checks/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

export const managedDataSourceGCGdriveCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const connectorsReplica = getConnectorsReplicaDbConnection();
  const frontReplica = getFrontReplicaDbConnection();
  const GdriveDataSources: { id: number; connectorId: string }[] =
    // eslint-disable-next-line dust/no-raw-sql -- Leggit
    await frontReplica.query(
      `SELECT id, "connectorId" FROM data_sources WHERE "connectorProvider" = 'google_drive'`,
      { type: QueryTypes.SELECT }
    );

  const CONCURRENCY = 8;
  await concurrentExecutor(
    GdriveDataSources,
    async (ds) => {
      heartbeat();

      // Retrieve all documents from the connector (first) in batches using an id cursor
      const BATCH_SIZE = 1_000;
      let lastId = 0;
      const connectorDocuments: { id: number; coreDocumentId: string }[] = [];
      let fetched = 0;
      do {
        const batch = (await connectorsReplica.query(
          // eslint-disable-next-line dust/no-raw-sql -- Legit
          'SELECT id, "dustFileId" as "coreDocumentId" FROM google_drive_files WHERE "connectorId" = :connectorId AND id > :lastId ORDER BY id ASC LIMIT :batchSize',
          {
            replacements: {
              connectorId: ds.connectorId,
              lastId,
              batchSize: BATCH_SIZE,
            },
            type: QueryTypes.SELECT,
          }
        )) as { id: number; coreDocumentId: string }[];

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
          { frontDataSourceId: ds.id },
          "Could not get core documents"
        );
        return;
      }
      const coreDocuments = coreDocumentsRes.value;
      const coreDocumentIds = coreDocuments.map((d) => d.document_id);

      const notDeleted = coreDocumentIds.filter(
        (coreId) => !connectorDocumentIds.has(coreId)
      );
      if (notDeleted.length > 0) {
        reportFailure(
          { notDeleted, connectorId: ds.connectorId },
          "Google Drive documents not properly Garbage collected"
        );
      } else {
        reportSuccess({
          connectorId: ds.connectorId,
        });
      }
    },
    { concurrency: CONCURRENCY }
  );
};
