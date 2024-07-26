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
  parents: string[];
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
  const coreDocumentsData = await coreReplica.query(
    `SELECT id, document_id, parents FROM data_sources_documents WHERE "data_source" = :coreDsId AND status = 'latest'`,
    {
      replacements: {
        coreDsId: coreDs[0].id,
      },
      type: QueryTypes.SELECT,
    }
  );

  const coreDocuments = coreDocumentsData as CoreDSDocument[];

  return new Ok(coreDocuments);
}
