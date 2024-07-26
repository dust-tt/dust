import { QueryTypes } from "sequelize";

import { getCoreDocuments } from "@app/lib/production_checks/managed_ds";
import type { CheckFunction } from "@app/lib/production_checks/types";
import {
  getConnectorReplicaDbConnection,
  getFrontReplicaDbConnection,
} from "@app/lib/production_checks/utils";

export const managedDataSourceGCGdriveCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const connectorsReplica = getConnectorReplicaDbConnection();
  const frontReplica = getFrontReplicaDbConnection();
  const GdriveDataSources: { id: number; connectorId: string }[] =
    await frontReplica.query(
      `SELECT id, "connectorId" FROM data_sources WHERE "connectorProvider" = 'google_drive'`,
      { type: QueryTypes.SELECT }
    );

  for (const ds of GdriveDataSources) {
    heartbeat();

    // Retrieve all documents from the connector (first)
    const connectorDocuments: { id: number; coreDocumentId: string }[] =
      await connectorsReplica.query(
        'SELECT id, "dustFileId" as "coreDocumentId" FROM google_drive_files WHERE "connectorId" = :connectorId',
        {
          replacements: {
            connectorId: ds.connectorId,
          },
          type: QueryTypes.SELECT,
        }
      );
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
      continue;
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
  }
};
