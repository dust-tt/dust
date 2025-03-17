import assert from "assert";
import { QueryTypes } from "sequelize";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ProviderVisibility } from "@app/types";
import { concurrentExecutor, CoreAPI, Ok } from "@app/types";
import { withRetries } from "@app/types";

const QUERY_BATCH_SIZE = 256;
const NODE_CONCURRENCY = 16;

interface Node {
  parents: string[];
  data_source: number;
  node_id: string;
  source_url: string;
  timestamp: number;
  title: string;
  mime_type: string;
  provider_visibility: ProviderVisibility | null;
  document: number | null;
  table: number | null;
  folder: number | null;
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
  if (
    coreNode.table !== null &&
    !coreNode.node_id.startsWith("google-spreadsheet")
  ) {
    logger.warn("Sheet that does not start with google-spreadsheet.");
    return;
  }
  const uniqueIds = [
    ...new Set(
      // Google Drive node IDs can start either with gdrive- (files and folders) or with google-spreadsheet (sheets).
      [coreNode.node_id, ...coreNode.parents].map((id) =>
        id.startsWith("google-spreadsheet") ? id : id.replace("gdrive-", "")
      )
    ),
  ];
  const newParents = uniqueIds.map((id) =>
    id.startsWith("google-spreadsheet") ? id : `gdrive-${id}`
  );
  const newParentId = newParents[1] || null;

  const localLogger = logger.child({
    dataSource: coreNode.data_source,
    nodeId: coreNode.node_id,
    fromParents: coreNode.parents,
    toParents: newParents,
    toParentId: newParentId,
  });

  if (
    skipIfParentsAreAlreadyCorrect &&
    newParents.every((x, i) => x === coreNode.parents[i]) &&
    coreNode.parents.every((x, i) => x === newParents[i])
  ) {
    localLogger.info(`SKIP document (parents are already correct)`);
    return new Ok(undefined);
  }

  if (coreNode.node_id != newParents[0]) {
    localLogger.error("Invalid node_id");
    return;
  }

  if (execute) {
    await withRetries(
      logger,
      async () => {
        let updateRes;
        if (coreNode.document) {
          updateRes = await coreAPI.updateDataSourceDocumentParents({
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
            documentId: coreNode.node_id,
            parents: newParents,
            parentId: newParentId,
          });
        } else if (coreNode.table) {
          updateRes = await coreAPI.updateTableParents({
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
            tableId: coreNode.node_id,
            parents: newParents,
            parentId: newParentId,
          });
        } else {
          updateRes = await coreAPI.upsertDataSourceFolder({
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
        }
        if (updateRes.isErr()) {
          localLogger.error(`Error while updating parents`);
          throw new Error(updateRes.error.message);
        }
      },
      { retries: 3 }
    )({});
    localLogger.info(`LIVE`);
  } else {
    localLogger.info(`DRY`);
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
    const rows = (await corePrimary.query(
      `SELECT *
       FROM data_sources_nodes
       WHERE data_source = :coreDataSourceId
         AND node_id > :nextId
         AND EXISTS
       (
           SELECT 1
           FROM UNNEST(parents) p
           WHERE p NOT LIKE 'gdrive-%'
             AND p NOT LIKE 'google-spreadsheet-%'
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

    if (rows.length === 0) {
      break;
    }

    nextId = rows[rows.length - 1].node_id;

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
    where: { connectorProvider: "google_drive" },
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
