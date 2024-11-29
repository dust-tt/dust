import { QueryTypes, Sequelize } from "sequelize";

import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

const { CORE_DATABASE_URI } = process.env;
const CHUNK_SIZE = 1000;

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const frontIntercomDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "intercom" },
  });

  for (const ds of frontIntercomDataSources) {
    logger.info(`Processing data source ${ds.id}`);

    let processedCount = 0;
    let affectedRowCount = 0;
    do {
      const whereCondition = `
        document_id <> ALL(parents)
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
          WHERE ${whereCondition}
          LIMIT :chunkSize;`;

        logger.info(`Running update query for chunk: ${query}`);
        const result = await coreSequelize.query(query, {
          replacements: {
            dataSourceId: ds.dustAPIDataSourceId,
            projectId: ds.dustAPIProjectId,
            chunkSize: CHUNK_SIZE,
          },
          type: QueryTypes.UPDATE,
        });

        affectedRowCount = result[1];
        logger.info(`Updated ${processedCount} documents so far`);
      } else {
        const query = `
          SELECT document_id, parents
          FROM data_sources_documents
          WHERE ${whereCondition}
          LIMIT :chunkSize;`;

        logger.info(`Running select query for chunk: ${query}`);
        const results = await coreSequelize.query(query, {
          replacements: {
            dataSourceId: ds.dustAPIDataSourceId,
            projectId: ds.dustAPIProjectId,
            chunkSize: CHUNK_SIZE,
          },
          type: QueryTypes.SELECT,
        });

        affectedRowCount = results.length;
        logger.info(`Would update ${processedCount} documents so far`);
        if (affectedRowCount >= 1) {
          logger.info("Sample of affected row:", results[0]);
        }
      }
      processedCount += affectedRowCount;
    } while (affectedRowCount > 0);

    logger.info(
      `Finished processing data source ${ds.id} - ${processedCount} documents total`
    );
  }
});
