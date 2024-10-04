import { QueryTypes } from "sequelize";

import {
  getConnectorReplicaDbConnection,
  getCoreReplicaDbConnection,
} from "@app/lib/production_checks/utils";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

type DataSource = {
  id: number;
  connectorId: string;
  dustAPIProjectId: number;
  dustAPIDataSourceId: string;
  name: string;
};

async function checkCoreDeleted(
  {
    dataSource,
    knownDocumentIds,
  }: { dataSource: DataSource; knownDocumentIds: Set<string> },
  logger: Logger
) {
  const coreReplica = getCoreReplicaDbConnection();
  const coreDataSource: { id: number }[] = await coreReplica.query(
    `SELECT id FROM data_sources WHERE "project" = :dustAPIProjectId AND data_source_id = :dataSourceId LIMIT 1`,
    {
      replacements: {
        dustAPIProjectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      },
      type: QueryTypes.SELECT,
    }
  );

  const coreDocuments: { id: number; document_id: string }[] =
    await coreReplica.query(
      // Note this query won't be valid anymore
      "SELECT id, document_id FROM data_sources_documents WHERE data_source = :dataSourceId AND status = 'latest'",
      {
        replacements: {
          dataSourceId: coreDataSource[0].id,
        },
        type: QueryTypes.SELECT,
      }
    );

  logger.info(
    {
      coreDocumentsCount: coreDocuments.length,
      knownDocumentsCount: knownDocumentIds.size,
      dataSourceId: dataSource.id,
    },
    `Garbage collect check`
  );

  const notDeleted = coreDocuments.filter((d) => {
    !knownDocumentIds.has(d.document_id);
  });
  if (notDeleted.length > 0) {
    logger.error(
      {
        notDeleted,
        connectorId: dataSource.connectorId,
        dataSourceId: dataSource.id,
      },
      `Found undeleted documents GoogleDrive`
    );
  }
}

async function checkGoogleDriveDeleted(logger: Logger) {
  const connectorsReplica = getConnectorReplicaDbConnection();
  const frontReplica = getFrontReplicaDbConnection();

  const gDriveDataSources: DataSource[] = await frontReplica.query(
    `SELECT id, "connectorId", "dustAPIProjectId", "dustAPIDataSourceId", "name" FROM data_sources WHERE "connectorProvider" = 'google_drive'`,
    { type: QueryTypes.SELECT }
  );

  for (const ds of gDriveDataSources) {
    // Retrieve a batch of 1024 documents from the

    const connectorDocuments: { id: number; dustFileId: string }[] =
      await connectorsReplica.query(
        'SELECT id, "dustFileId" FROM google_drive_files WHERE "connectorId" = :connectorId AND "mimeType" <> \'application/vnd.google-apps.folder\'',
        {
          replacements: {
            connectorId: ds.connectorId,
          },
          type: QueryTypes.SELECT,
        }
      );
    const knownDocumentIds = new Set(
      connectorDocuments.map((d) => d.dustFileId)
    );

    await checkCoreDeleted({ dataSource: ds, knownDocumentIds }, logger);
  }
}

async function checkNotionDeleted(logger: Logger) {
  const connectorsReplica = getConnectorReplicaDbConnection();
  const frontReplica = getFrontReplicaDbConnection();

  const notionDataSources: {
    id: number;
    connectorId: string;
    dustAPIProjectId: number;
    dustAPIDataSourceId: string;
    name: string;
  }[] = await frontReplica.query(
    `SELECT id, "connectorId", "dustAPIProjectId", "dustAPIDataSourceId", "name" FROM data_sources WHERE "connectorProvider" = 'notion'`,
    { type: QueryTypes.SELECT }
  );

  for (const ds of notionDataSources) {
    // Retrieve a batch of 1024 documents from the

    const connectorDocuments: { id: number; notionPageId: string }[] =
      await connectorsReplica.query(
        'SELECT id, "notionPageId" FROM notion_pages WHERE "connectorId" = :connectorId',
        {
          replacements: {
            connectorId: ds.connectorId,
          },
          type: QueryTypes.SELECT,
        }
      );
    const knownDocumentIds = new Set(
      connectorDocuments.map((d) => `notion-${d.notionPageId}`)
    );

    await checkCoreDeleted({ dataSource: ds, knownDocumentIds }, logger);
  }
}

makeScript({}, async ({ execute }, logger) => {
  await checkGoogleDriveDeleted(logger);
  await checkNotionDeleted(logger);
});
