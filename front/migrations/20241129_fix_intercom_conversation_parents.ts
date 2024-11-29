import { QueryTypes, Sequelize } from "sequelize";

import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

const { CORE_DATABASE_URI } = process.env;

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const frontIntercomDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "intercom" },
  });

  for (const ds of frontIntercomDataSources) {
    logger.info(`Processing data source ${ds.id}`);

    const queryWhere = `
      WHERE document_id <> ALL(parents)
      AND EXISTS (
        SELECT 1 FROM data_sources
        WHERE data_sources.id = data_sources_documents.data_source
        AND data_sources.data_source_id = :dataSourceId
        AND data_sources.project = :projectId
      )`;

    if (execute) {
      const query = `
          UPDATE data_sources_documents
          SET parents = array_prepend(document_id, parents)
              ${queryWhere};`;

      console.log(`Running the following query on core: ${query}`);
      await coreSequelize.query(query, {
        replacements: {
          dataSourceId: ds.dustAPIDataSourceId,
          projectId: ds.dustAPIProjectId,
        },
      });
    } else {
      const query = `
          SELECT document_id, parents
          FROM data_sources_documents
                   ${queryWhere};`;

      console.log(`Running the following query on core: ${query}`);
      const results = await coreSequelize.query(query, {
        replacements: {
          dataSourceId: ds.dustAPIDataSourceId,
          projectId: ds.dustAPIProjectId,
        },
        type: QueryTypes.SELECT,
      });

      console.log(`Would update ${results.length} documents`);
      console.log("Sample of affected rows:", results.slice(0, 5));
    }
  }
});
