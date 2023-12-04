import { QueryTypes, Sequelize } from "sequelize";

import { Err, Ok, Result } from "@dust-tt/types";
const { CORE_DATABASE_READ_REPLICA_URI, FRONT_DATABASE_READ_REPLICA_URI } =
  process.env;

export type CoreDSDocument = {
  id: number;
  document_id: string;
  parents: string[];
};

export async function getCoreDocuments(
  frontDataSourceId: number
): Promise<Result<CoreDSDocument[], Error>> {
  const core_sequelize = new Sequelize(
    CORE_DATABASE_READ_REPLICA_URI as string,
    {
      logging: false,
    }
  );
  const front_sequelize = new Sequelize(
    FRONT_DATABASE_READ_REPLICA_URI as string,
    {
      logging: false,
    }
  );

  const managedDsData = await front_sequelize.query(
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
  const coreDsData = await core_sequelize.query(
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
  const coreDocumentsData = await core_sequelize.query(
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
