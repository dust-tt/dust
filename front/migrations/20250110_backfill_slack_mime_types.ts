import assert from "assert";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const { CORE_DATABASE_URI } = process.env;
const BATCH_SIZE = 512;

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  nodeType: "thread" | "messages",
  execute: boolean,
  logger: typeof Logger
) {
  const pattern = `^slack-[A-Z0-9]+-${nodeType}-[0-9.\\-]+$`;
  const mimeType = `application/vnd.dust.slack.${nodeType}`;

  logger.info({ pattern, mimeType }, "Processing data source");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { id: number }[] = await coreSequelize.query(
      `
          SELECT dsn.id
          FROM data_sources_nodes dsn
                   JOIN data_sources ds ON ds.id = dsn.data_source
          WHERE dsn.id > :nextId
            AND ds.data_source_id = :dataSourceId
            AND ds.project = :projectId
          ORDER BY dsn.id
          LIMIT :batchSize;`,
      {
        replacements: {
          dataSourceId: frontDataSource.dustAPIDataSourceId,
          projectId: frontDataSource.dustAPIProjectId,
          batchSize: BATCH_SIZE,
          nextId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing data source.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    if (execute) {
      await coreSequelize.query(
        `UPDATE data_sources_nodes SET mime_type = :mimeType WHERE id IN (:ids)`,
        {
          replacements: {
            mimeType,
            ids: rows.map((row) => row.id),
          },
        }
      );
      logger.info(
        `Updated chunk from ${rows[0].id} to ${rows[rows.length - 1].id}`
      );
    } else {
      logger.info(
        `Would update chunk from ${rows[0].id} to ${rows[rows.length - 1].id}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

makeScript(
  {
    nodeType: { type: "string", choices: ["thread", "messages"] },
  },
  async ({ nodeType, execute }, logger) => {
    assert(CORE_DATABASE_URI, "CORE_DATABASE_URI is required");

    const coreSequelize = getCorePrimaryDbConnection();

    if (!["thread", "messages"].includes(nodeType)) {
      throw new Error(`Unknown node type: ${nodeType}`);
    }

    const frontDataSources = await DataSourceModel.findAll({
      where: { connectorProvider: "slack" },
    });
    logger.info(`Found ${frontDataSources.length} Slack data sources`);

    for (const frontDataSource of frontDataSources) {
      await backfillDataSource(
        frontDataSource,
        coreSequelize,
        nodeType as "thread" | "messages",
        execute,
        logger.child({
          dataSourceId: frontDataSource.id,
          connectorId: frontDataSource.connectorId,
        })
      );
    }
  }
);
