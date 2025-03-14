import assert from "assert";
import _ from "lodash";
import { QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types";

const { CORE_DATABASE_URI } = process.env;
const SELECT_CHUNK_SIZE = 1000;
const UPDATE_CHUNK_SIZE = 10;

makeScript({}, async ({ execute }, logger) => {
  assert(CORE_DATABASE_URI, "CORE_DATABASE_URI is required");

  const coreSequelize = getCorePrimaryDbConnection();

  const frontIntercomDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "intercom" },
  });
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  for (const ds of frontIntercomDataSources) {
    logger.info(`Processing data source ${ds.id}`);

    let nextId = 0;
    for (;;) {
      const query = `
          SELECT doc.id, doc.document_id, doc.parents
          FROM data_sources_documents doc
                   JOIN data_sources ds ON ds.id = doc.data_source
          WHERE doc.id > :nextId
            AND ds.data_source_id = :dataSourceId
            AND ds.project = :projectId
          ORDER BY doc.id
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
                parentId: null,
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
