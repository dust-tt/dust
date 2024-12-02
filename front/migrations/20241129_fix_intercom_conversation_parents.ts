import { CoreAPI } from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";
import { QueryTypes, Sequelize } from "sequelize";

import config from "@app/lib/api/config";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

const { CORE_DATABASE_URI } = process.env;
const SELECT_CHUNK_SIZE = 1000;
const UPDATE_CHUNK_SIZE = 10;

makeScript({}, async ({ execute }, logger) => {
  assert(CORE_DATABASE_URI, "CORE_DATABASE_URI is required");

  const coreSequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const frontIntercomDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "intercom" },
  });
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  for (const ds of frontIntercomDataSources) {
    logger.info(`Processing data source ${ds.id}`);

    let nextId = 0;
    for (;;) {
      const query = `
          SELECT id, document_id, parents
          FROM data_sources_documents
          WHERE id > :nextId
            AND EXISTS (SELECT 1
                        FROM data_sources
                        WHERE data_sources.id = data_sources_documents.data_source
                          AND data_sources.data_source_id = :dataSourceId
                          AND data_sources.project = :projectId)
          ORDER BY id
          LIMIT :chunkSize;`;

      logger.info(`Running SELECT query for chunk: ${query}`);
      const result: any[] = await coreSequelize.query(query, {
        replacements: {
          dataSourceId: ds.dustAPIDataSourceId,
          projectId: ds.dustAPIProjectId,
          chunkSize: SELECT_CHUNK_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      });

      const rowsToUpdate = result.filter(
        // same condition as what was logged
        (row) =>
          !row.parents ||
          row.parents.length === 0 ||
          row.parents[0] !== row.document_id
      );

      // doing smaller chunks to avoid long transactions
      const chunks = _.chunk(rowsToUpdate, UPDATE_CHUNK_SIZE);

      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i}/${chunks.length}...`);
        await Promise.all(
          chunks[i].map(async (row) => {
            if (execute) {
              await coreAPI.updateDataSourceDocumentParents({
                projectId: ds.dustAPIProjectId,
                dataSourceId: ds.dustAPIDataSourceId,
                documentId: row.document_id,
                parents: row.parents
                  ? [row.document_id, ...row.parents]
                  : [row.document_id],
              });
            } else {
              logger.info(`Would update document ${row.document_id}`);
            }
          })
        );
      }

      if (result.length == 0) {
        logger.info(
          { dataSource: ds.id, nextId },
          `Finished processing data source.`
        );
        break;
      }
      nextId = result[result.length - 1].id;
      logger.info(
        { dataSource: ds.id, nextId },
        `Updated a chunk of ${result.length} documents.`
      );
    }
  }
});
