import assert from "assert";
import _ from "lodash";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI, Ok } from "@app/types";
import { withRetries } from "@app/types";

const QUERY_BATCH_SIZE = 256;
const NODE_CONCURRENCY = 16;

async function migrateDocument({
  coreAPI,
  dataSource,
  coreNode,
  execute,
  skipIfParentsAreAlreadyCorrect,
  logger,
}: {
  coreAPI: CoreAPI;
  dataSource: DataSourceModel;
  coreNode: {
    parents: string[];
    node_id: string;
  };
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
  logger: typeof Logger;
}) {
  let newParents = coreNode.parents;
  let newParentId: string | null = null;
  try {
    const uniqueIds = _.uniq(
      [coreNode.node_id, ...coreNode.parents].map(
        (x) => _.last(x.split("notion-"))!
      )
    );
    newParents = [...uniqueIds.map((id) => `notion-${id}`)];
    newParentId = uniqueIds.length > 1 ? `notion-${uniqueIds[1]}` : null;
  } catch (e) {
    logger.error(
      {
        nodeId: coreNode.node_id,
        parents: coreNode.parents,
      },
      `TRANSFORM_ERROR`
    );
    throw e;
  }

  if (
    skipIfParentsAreAlreadyCorrect &&
    newParents.every((x, i) => x === coreNode.parents[i])
  ) {
    logger.info(
      {
        documentId: coreNode.node_id,
        fromParents: coreNode.parents,
        toParents: newParents,
      },
      `SKIP document (parents are already correct)`
    );
    return new Ok(undefined);
  }

  if (execute) {
    await withRetries(
      logger,
      async () => {
        const updateRes = await coreAPI.updateDataSourceDocumentParents({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          documentId: coreNode.node_id,
          parents: newParents,
          parentId: newParentId,
        });
        if (updateRes.isErr()) {
          logger.error(
            {
              nodeId: coreNode.node_id,
              fromParents: coreNode.parents,
              toParents: newParents,
              toParentId: newParentId,
            },
            `Error while updating parents`
          );
          throw new Error(updateRes.error.message);
        }
      },
      { retries: 10 }
    )({});

    logger.info(
      {
        nodeId: coreNode.node_id,
        fromParents: coreNode.parents,
        toParents: newParents,
      },
      `LIVE`
    );
  } else {
    logger.info(
      {
        nodeId: coreNode.node_id,
        fromParents: coreNode.parents,
        toParents: newParents,
      },
      `DRY`
    );
  }

  return new Ok(undefined);
}

async function migrateDataSource({
  coreAPI,
  dataSource,
  execute,
  skipIfParentsAreAlreadyCorrect,
  parentLogger,
}: {
  coreAPI: CoreAPI;
  dataSource: DataSourceModel;
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
  parentLogger: typeof Logger;
}) {
  const logger = parentLogger.child({ dataSourceId: dataSource.id });
  const corePrimary = getCorePrimaryDbConnection();

  // Retrieve the core data source.
  const [coreDataSourceRows] = (await corePrimary.query(
    `SELECT id, data_source_id
     FROM data_sources
     WHERE project = ?
       AND data_source_id = ?`,
    {
      replacements: [
        dataSource.dustAPIProjectId,
        dataSource.dustAPIDataSourceId,
      ],
    }
  )) as { id: number; data_source_id: string }[][];

  assert(
    coreDataSourceRows.length === 1 &&
      coreDataSourceRows[0].data_source_id === dataSource.dustAPIDataSourceId,
    "Core data source mismatch"
  );
  const coreDataSourceId = coreDataSourceRows[0].id;

  // For all nodes in the data source (can be big).
  let nextId = "";

  for (;;) {
    const [rows] = (await (async () => {
      return corePrimary.query(
        `SELECT node_id, parents
         FROM data_sources_nodes
         WHERE data_source = :coreDataSourceId
           AND node_id > :nextId
           AND EXISTS
         (
             SELECT 1
             FROM UNNEST(parents) p
             WHERE p NOT LIKE 'notion-%'
         )
         ORDER BY node_id
         LIMIT :batchSize`,
        {
          replacements: {
            coreDataSourceId,
            nextId,
            batchSize: QUERY_BATCH_SIZE,
          },
        }
      );
    })()) as {
      parents: string[];
      node_id: string;
    }[][];

    logger.info({ nextId, rowCount: rows.length }, "BATCH");

    if (rows.length === 0) {
      break;
    }

    nextId = rows[rows.length - 1].node_id;

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        rows,
        (coreNode) =>
          migrateDocument({
            coreAPI,
            dataSource,
            coreNode,
            skipIfParentsAreAlreadyCorrect,
            execute,
            logger,
          }),
        { concurrency: NODE_CONCURRENCY }
      );
    } catch (e) {
      logger.error(
        {
          error: e,
          nextDataSourceId: dataSource.id,
          nextId,
        },
        `ERROR`
      );
      throw e;
    }
  }
}

async function migrateAll({
  coreAPI,
  nextDataSourceId,
  execute,
  skipIfParentsAreAlreadyCorrect,
  logger,
}: {
  coreAPI: CoreAPI;
  nextDataSourceId: number;
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
  logger: typeof Logger;
}) {
  // retrieve all data sources for the provider
  const dataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "notion" },
    order: [["id", "ASC"]],
  });

  for (const dataSource of dataSources) {
    if (dataSource.id >= nextDataSourceId) {
      logger.info({ dataSourceId: dataSource.id }, "MIGRATING");
      await migrateDataSource({
        coreAPI,
        dataSource,
        execute,
        skipIfParentsAreAlreadyCorrect,
        parentLogger: logger,
      });
    } else {
      logger.info({ dataSourceId: dataSource.id }, "SKIP");
    }
  }
}

makeScript(
  {
    skipIfParentsAreAlreadyCorrect: { type: "boolean", default: false },
    nextDataSourceId: { type: "number", default: 0 },
  },
  async (
    { nextDataSourceId, execute, skipIfParentsAreAlreadyCorrect },
    logger
  ) => {
    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

    await migrateAll({
      coreAPI,
      nextDataSourceId,
      execute,
      skipIfParentsAreAlreadyCorrect,
      logger,
    });
  }
);
