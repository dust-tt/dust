import { QueryTypes, Sequelize } from "sequelize";

import { getCoreDocuments } from "@app/production_checks/lib/managed_ds";
import { CheckFunction } from "@app/production_checks/types/check";

const {
  CONNECTORS_DATABASE_READ_REPLICA_URI,
  FRONT_DATABASE_READ_REPLICA_URI,
} = process.env;

export const managedDataSourceGCGdriveCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const connectorsSequelize = new Sequelize(
    CONNECTORS_DATABASE_READ_REPLICA_URI as string,
    {
      logging: false,
    }
  );
  const frontSequelize = new Sequelize(
    FRONT_DATABASE_READ_REPLICA_URI as string,
    {
      logging: false,
    }
  );
  const GdriveDataSources: { id: number; connectorId: string }[] =
    await frontSequelize.query(
      `SELECT id, "connectorId" FROM data_sources WHERE "connectorProvider" = 'google_drive'`,
      { type: QueryTypes.SELECT }
    );

  for (const ds of GdriveDataSources) {
    const coreDocumentsRes = await getCoreDocuments(ds.id);
    if (coreDocumentsRes.isErr()) {
      reportFailure(
        { frontDataSourceId: ds.id },
        "Could not get core documents"
      );
      continue;
    }
    const coreDocuments = coreDocumentsRes.value;

    const connectorDocuments: { id: number; coreDocumentId: string }[] =
      await connectorsSequelize.query(
        'SELECT id, "dustFileId" as "coreDocumentId" FROM google_drive_files WHERE "connectorId" = :connectorId',
        {
          replacements: {
            connectorId: ds.connectorId,
          },
          type: QueryTypes.SELECT,
        }
      );

    const coreDocumentIds = coreDocuments.map((d) => d.document_id);
    const connectorDocumentIds = new Set(
      connectorDocuments.map((d) => d.coreDocumentId)
    );
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
