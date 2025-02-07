import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import {
  getCoreReplicaDbConnection,
  getFrontReplicaDbConnection,
} from "@app/lib/production_checks/utils";

export type CoreDSDocument = {
  id: number;
  document_id: string;
};

export async function getCoreDocuments(
  frontDataSourceId: number
): Promise<Result<CoreDSDocument[], Error>> {
  const coreReplica = getCoreReplicaDbConnection();
  const frontReplica = getFrontReplicaDbConnection();

  const managedDsData = await frontReplica.query(
    'SELECT id, "connectorId", "connectorProvider", "dustAPIProjectId" \
         FROM data_sources WHERE id = :frontDataSourceId',
    {
      type: QueryTypes.SELECT,
      replacements: {
        frontDataSourceId: frontDataSourceId,
      },
    }
  );
  const managedDs = managedDsData as {
    id: number;
    dustAPIProjectId: string;
  }[];
  if (!managedDs.length) {
    return new Err(
      new Error(`Front data source not found for id ${frontDataSourceId}`)
    );
  }
  const ds = managedDs[0];
  const coreDsData = await coreReplica.query(
    `SELECT id FROM data_sources WHERE "project" = :dustAPIProjectId`,
    {
      replacements: {
        dustAPIProjectId: ds.dustAPIProjectId,
      },
      type: QueryTypes.SELECT,
    }
  );
  const coreDs = coreDsData as { id: number }[];
  if (coreDs.length === 0) {
    return new Err(
      new Error(`Core data source not found for front datasource  ${ds.id}`)
    );
  }

  let lastDocumentId = "";
  const batchSize = 10000;
  const coreDocuments: CoreDSDocument[] = [];
  let batchDocuments: CoreDSDocument[] = [];

  do {
    const batch = await coreReplica.query(
      `SELECT id, document_id
       FROM data_sources_documents
       WHERE "data_source" = :coreDsId
       AND document_id > :lastDocumentId
       AND status = 'latest'
       ORDER BY document_id ASC
       LIMIT :limit`,
      {
        replacements: {
          coreDsId: coreDs[0].id,
          lastDocumentId,
          limit: batchSize,
        },
        type: QueryTypes.SELECT,
      }
    );

    batchDocuments = batch as CoreDSDocument[];
    if (batchDocuments.length === 0) {
      break;
    }

    coreDocuments.push(...batchDocuments);
    lastDocumentId = batchDocuments[batchDocuments.length - 1].document_id;
  } while (batchDocuments.length === batchSize);

  return new Ok(coreDocuments);
}
