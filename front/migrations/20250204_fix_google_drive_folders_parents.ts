import type { ProviderVisibility } from "@dust-tt/types";
import { concurrentExecutor, CoreAPI, Ok } from "@dust-tt/types";
import { withRetries } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const QUERY_BATCH_SIZE = 256;
const NODE_CONCURRENCY = 16;

const GDRIVE_PREFIX = "gdrive-";

interface Node {
  parents: string[];
  node_id: string;
  source_url: string;
  timestamp: number;
  title: string;
  mime_type: string;
  provider_visibility: ProviderVisibility | null;
}

async function migrateNode({
  coreAPI,
  dataSource,
  coreNode,
  execute,
  skipIfParentsAreAlreadyCorrect,
  logger,
}: {
  coreAPI: CoreAPI;
  dataSource: DataSourceModel;
  coreNode: Node;
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
  logger: typeof Logger;
}) {
  let newParents = coreNode.parents;
  let newParentId: string | null = null;
  if (coreNode.node_id.startsWith("google-spreadsheet")) {
    logger.warn("Folder that starts with google-spreadsheet.");
    return;
  }
  if (!coreNode.node_id.startsWith(GDRIVE_PREFIX)) {
    logger.warn(`Folder that does not start with ${GDRIVE_PREFIX}.`);
    return;
  }
  const uniqueIds = [
    ...new Set(
      // Google Drive node IDs can start either with gdrive- (files and folders) or with google-spreadsheet (sheets).
      [coreNode.node_id, ...coreNode.parents].map((id) =>
        id.replace(GDRIVE_PREFIX, "")
      )
    ),
  ];
  newParents = uniqueIds.map((id) => `${GDRIVE_PREFIX}${id}`);
  newParentId = newParents[1] || null;

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
        const updateRes = await coreAPI.upsertDataSourceFolder({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          folderId: coreNode.node_id,
          parents: newParents,
          parentId: newParentId,
          sourceUrl: coreNode.source_url,
          providerVisibility: coreNode.provider_visibility,
          mimeType: coreNode.mime_type,
          title: coreNode.title,
          timestamp: coreNode.timestamp,
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

  const { dustAPIProjectId, dustAPIDataSourceId } = dataSource;
  // Retrieve the core data source.
  const [coreDataSourceRows] = (await corePrimary.query(
    `SELECT id, data_source_id
     FROM data_sources
     WHERE project = :dustAPIProjectId
       AND data_source_id = :dustAPIDataSourceId`,
    { replacements: { dustAPIProjectId, dustAPIDataSourceId } }
  )) as { id: number; data_source_id: string }[][];

  if (
    coreDataSourceRows.length !== 1 ||
    coreDataSourceRows[0].data_source_id !== dataSource.dustAPIDataSourceId
  ) {
    logger.error(
      { coreDataSourceRows, dustAPIProjectId, dustAPIDataSourceId },
      "Core data source mismatch"
    );
    return;
  }

  const coreDataSourceId = coreDataSourceRows[0].id;

  // For all nodes in the data source (can be big).
  let nextId = "";
  let rows;

  do {
    rows = (await corePrimary.query(
      `SELECT node_id,
              parents,
              source_url,
              timestamp,
              title,
              mime_type,
              provider_visibility
       FROM data_sources_nodes
       WHERE data_source = :coreDataSourceId
         AND node_id > :nextId
         AND folder IS NOT NULL
         AND EXISTS
       (
           SELECT 1
           FROM UNNEST(parents) p
           WHERE p NOT LIKE 'gdrive-%'
       )
       ORDER BY node_id
       LIMIT :batchSize`,
      {
        replacements: {
          coreDataSourceId,
          nextId,
          batchSize: QUERY_BATCH_SIZE,
        },
        type: QueryTypes.SELECT,
      }
    )) as Node[];

    nextId = rows[rows.length - 1]?.node_id;

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        rows,
        (coreNode) =>
          migrateNode({
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
  } while (rows.length === QUERY_BATCH_SIZE);
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
    where: { connectorProvider: "google_drive" },
    order: [["id", "ASC"]],
  });

  for (const dataSource of dataSources) {
    if (dataSource.id >= nextDataSourceId) {
      logger.info({ dataSourceId: dataSource.id }, "MIGRATE");
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
