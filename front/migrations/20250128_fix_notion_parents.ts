import { concurrentExecutor, CoreAPI, Ok } from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { withRetries } from "@app/lib/utils/retries";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

type MigratorAction = "transform" | "clean";

const isMigratorAction = (action: string): action is MigratorAction => {
  return ["transform", "clean"].includes(action);
};

type ProviderMigrator = {
  /// returns [nodeId, ...oldParents, ...newParents] idempotently
  transformer: (
    nodeId: string,
    parents: string[]
  ) => { parents: string[]; parentId: string | null };
  /// returns [nodeId, ...newParents] idempotently
  cleaner: (
    nodeId: string,
    parents: string[]
  ) => { parents: string[]; parentId: string | null };
};

const QUERY_BATCH_SIZE = 256;
const NODE_CONCURRENCY = 16;

const migrators: ProviderMigrator = {
  transformer: (nodeId, parents) => {
    const uniqueIds = _.uniq(
      [nodeId, ...parents].map((x) => _.last(x.split("notion-"))!)
    );
    return {
      parents: [
        // new parents
        ...uniqueIds.map((id) => `notion-${id}`),
        // legacy parents
        ...uniqueIds,
      ],
      parentId: uniqueIds.length > 1 ? `notion-${uniqueIds[1]}` : null,
    };
  },
  cleaner: (nodeId, parents) => {
    // Only keep the new parents
    const uniqueIds = _.uniq(
      [nodeId, ...parents].map((x) => _.last(x.split("notion-"))!)
    );
    return {
      parents: uniqueIds.map((id) => `notion-${id}`),
      parentId: uniqueIds.length > 1 ? `notion-${uniqueIds[1]}` : null,
    };
  },
};

async function migrateDocument({
  coreAPI,
  action,
  dataSource,
  coreDocument,
  execute,
  skipIfParentsAreAlreadyCorrect,
  logger,
}: {
  coreAPI: CoreAPI;
  action: MigratorAction;
  dataSource: DataSourceModel;
  coreDocument: {
    id: number;
    parents: string[];
    document_id: string;
  };
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
  logger: typeof Logger;
}) {
  let newParents = coreDocument.parents;
  let newParentId: string | null = null;
  try {
    const { parents, parentId } =
      action === "transform"
        ? migrators.transformer(coreDocument.document_id, coreDocument.parents)
        : migrators.cleaner(coreDocument.document_id, coreDocument.parents);
    newParents = parents;
    newParentId = parentId;
  } catch (e) {
    logger.error(
      {
        documentId: coreDocument.document_id,
        parents: coreDocument.parents,
      },
      `TRANSFORM_ERROR`
    );
    throw e;
  }

  if (
    skipIfParentsAreAlreadyCorrect &&
    newParents.every((x, i) => x === coreDocument.parents[i])
  ) {
    logger.info(
      {
        documentId: coreDocument.document_id,
        fromParents: coreDocument.parents,
        toParents: newParents,
      },
      `SKIP document (parents are already correct)`
    );
    return new Ok(undefined);
  }

  if (execute) {
    await withRetries(
      async () => {
        const updateRes = await coreAPI.updateDataSourceDocumentParents({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          documentId: coreDocument.document_id,
          parents: newParents,
          parentId: newParentId,
        });
        if (updateRes.isErr()) {
          logger.error(
            {
              tableId: coreDocument.document_id,
              fromParents: coreDocument.parents,
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
        documentId: coreDocument.document_id,
        fromParents: coreDocument.parents,
        toParents: newParents,
      },
      `LIVE`
    );
  } else {
    logger.info(
      {
        documentId: coreDocument.document_id,
        fromParents: coreDocument.parents,
        toParents: newParents,
      },
      `DRY`
    );
  }

  return new Ok(undefined);
}

async function migrateDataSource({
  coreAPI,
  action,
  dataSource,
  execute,
  skipIfParentsAreAlreadyCorrect,
  parentLogger,
}: {
  coreAPI: CoreAPI;
  action: MigratorAction;
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

  // For all documents in the data source (can be big).
  let nextTimestamp = 0;
  let nextId = null;

  for (;;) {
    const [rows] = (await (async () => {
      // If nextId is null, we only filter by timestamp
      if (nextId === null) {
        return corePrimary.query(
          `SELECT dsd.id, dsd.document_id, dsd.timestamp, dsn.parents
           FROM data_sources_documents dsd
                LEFT JOIN data_sources_nodes dsn ON dsd.id = dsn.document
           WHERE dsd.data_source = :coreDataSourceId
             AND dsd.status = :status
             AND dsd.timestamp >= :nextTimestamp
           ORDER BY dsd.timestamp, dsd.id
           LIMIT :batchSize`,
          {
            replacements: {
              coreDataSourceId,
              status: "latest",
              nextTimestamp,
              batchSize: QUERY_BATCH_SIZE,
            },
          }
        );
      } else {
        // If nextId is not null, we filter by timestamp and id
        return corePrimary.query(
          `SELECT dsd.id, dsd.document_id, dsd.timestamp, dsn.parents
           FROM data_sources_documents dsd
                LEFT JOIN data_sources_nodes dsn ON dsd.id = dsn.document
           WHERE dsd.data_source = :coreDataSourceId
             AND dsd.status = :status
             AND dsd.timestamp >= :nextTimestamp
             AND dsd.id > :nextId
           ORDER BY dsd.timestamp, dsd.id
           LIMIT :batchSize`,
          {
            replacements: {
              coreDataSourceId,
              status: "latest",
              nextTimestamp,
              nextId,
              batchSize: QUERY_BATCH_SIZE,
            },
          }
        );
      }
    })()) as {
      id: number;
      parents: string[];
      document_id: string;
      timestamp: number;
    }[][];

    if (rows.length === 0) {
      break;
    }

    // If we are just getting out of a pagination on ids,
    // we have to set a conservative value for the timestamp
    // as we may have reached a timestamp too high due to having filtered on the ids.
    if (
      nextId !== null &&
      rows[0].timestamp !== rows[rows.length - 1].timestamp
    ) {
      // There is no way to set the timestamp based on updatedRows, setting the most conservative value possible here to make sure we don't miss any row.
      // Note: here it would be incorrect to use rows[rows.length - 1].timestamp as it would be the highest timestamp of a batch where id > nextId,
      // which makes rows[rows.length - 1].timestamp too high.
      nextTimestamp += 1;
    } else {
      // If we are scrolling through the timestamps, we can set the nextTimestamp to the last timestamp (same if all documents have the same timestamp, which is a no-op).
      nextTimestamp = rows[rows.length - 1].timestamp;
    }
    // If all documents have the same timestamp, we set nextId to the last id.
    nextId =
      rows[0].timestamp === rows[rows.length - 1].timestamp
        ? rows[rows.length - 1].id
        : null;

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        rows,
        (coreDocument) =>
          migrateDocument({
            coreAPI,
            action,
            dataSource,
            coreDocument,
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
          nextTimestamp,
        },
        `ERROR`
      );
      throw e;
    }
  }
}

async function migrateAll({
  coreAPI,
  action,
  nextDataSourceId,
  execute,
  skipIfParentsAreAlreadyCorrect,
  logger,
}: {
  coreAPI: CoreAPI;
  action: MigratorAction;
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
        action,
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
    action: { type: "string", choices: ["transform", "clean"] },
    skipIfParentsAreAlreadyCorrect: { type: "boolean", default: false },
    nextDataSourceId: { type: "number", default: 0 },
  },
  async (
    { action, nextDataSourceId, execute, skipIfParentsAreAlreadyCorrect },
    logger
  ) => {
    if (!isMigratorAction(action)) {
      logger.error(
        `Invalid action ${action}, supported actions are "transform" and "clean"`
      );
      return;
    }
    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

    await migrateAll({
      coreAPI,
      action,
      nextDataSourceId,
      execute,
      skipIfParentsAreAlreadyCorrect,
      logger,
    });
  }
);
