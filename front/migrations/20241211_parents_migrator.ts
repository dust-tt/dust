import type { ConnectorProvider } from "@dust-tt/types";
import {
  concurrentExecutor,
  CoreAPI,
  isConnectorProvider,
  Ok,
} from "@dust-tt/types";
import assert from "assert";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

type MigratorAction = "transform" | "clean";

const isMigratorAction = (action: string): action is MigratorAction => {
  return ["transform", "clean"].includes(action);
};

type ProviderMigrator = {
  transformer: (nodeId: string, parents: string[]) => string[];
  cleaner: (nodeId: string, parents: string[]) => string[];
};

const QUERY_BATCH_SIZE = 128;
const DOCUMENT_CONCURRENCY = 8;
const TABLE_CONCURRENCY = 16;

const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: {
    transformer: (nodeId, parents) => {
      switch (parents.length) {
        case 0:
          throw new Error("No parents");
        case 1: {
          // Check that parents[1] does not have the prefix
          assert(!parents[0].startsWith("slack-"));

          const channelId = parents[0];
          return [nodeId, channelId, `slack-channel-${channelId}`];
        }
        case 2: {
          // Check parents[0] (the nodeId)
          assert(parents[0] === nodeId, "parents[0] !== nodeId");
          // Check that parents[1] does not have a prefix
          assert(!parents[1].startsWith("slack-"));

          const channelId = parents[1];
          return [nodeId, channelId, `slack-channel-${channelId}`];
        }
        case 3: {
          // Check parents[0] (the nodeId)
          assert(parents[0] === nodeId, "parents[0] !== nodeId");
          // Check parents[2] vs parents[1]
          assert(
            parents[2] === `slack-channel-${parents[1]}`,
            "parents[2] !== `slack-channel-${parents[1]}`"
          );

          // Nothing to do
          return parents;
        }
        default:
          throw new Error("Too many parents");
      }
    },
    cleaner: (nodeId, parents) => {
      if (parents.length !== 3) {
        throw new Error("Parents len != 3");
      }
      // Check parents[0] (the nodeId)
      assert(parents[0] === nodeId, "parents[0] !== nodeId");
      // Check parents[2] vs parents[1]
      assert(
        parents[2] === `slack-channel-${parents[1]}`,
        "parents[2] !== `slack-channel-${parents[1]}`"
      );
      const channelId = parents[1];

      return [nodeId, `slack-channel-${channelId}`];
    },
  },
  google_drive: null,
  microsoft: null,
  github: null,
  notion: null,
  snowflake: null,
  webcrawler: null,
  zendesk: null,
  confluence: null,
  intercom: null,
};

const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

async function migrateDocument({
  action,
  migrator,
  dataSource,
  coreDocument,
  execute,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  coreDocument: {
    id: number;
    parents: string[];
    document_id: string;
  };
  execute: boolean;
}) {
  let newParents = coreDocument.parents;
  try {
    newParents =
      action === "transform"
        ? migrator.transformer(coreDocument.document_id, coreDocument.parents)
        : migrator.cleaner(coreDocument.document_id, coreDocument.parents);
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

  if (execute) {
    const updateRes = await coreAPI.updateDataSourceDocumentParents({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId: coreDocument.document_id,
      parents: newParents,
    });

    if (updateRes.isErr()) {
      throw new Error(updateRes.error.message);
    }

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

async function migrateTable({
  action,
  migrator,
  dataSource,
  coreTable,
  execute,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  coreTable: {
    id: number;
    parents: string[];
    table_id: string;
  };
  execute: boolean;
}) {
  let newParents = coreTable.parents;
  try {
    newParents =
      action === "transform"
        ? migrator.transformer(coreTable.table_id, coreTable.parents)
        : migrator.cleaner(coreTable.table_id, coreTable.parents);
  } catch (e) {
    logger.error(
      {
        tableId: coreTable.table_id,
        parents: coreTable.parents,
      },
      `TRANSFORM_ERROR`
    );
    throw e;
  }

  if (execute) {
    const updateRes = await coreAPI.updateTableParents({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: coreTable.table_id,
      parents: newParents,
    });

    if (updateRes.isErr()) {
      throw new Error(updateRes.error.message);
    }

    logger.info(
      {
        tableId: coreTable.table_id,
        fromParents: coreTable.parents,
        toParents: newParents,
      },
      `LIVE`
    );
  } else {
    logger.info(
      {
        tableId: coreTable.table_id,
        fromParents: coreTable.parents,
        toParents: newParents,
      },
      `DRY`
    );
  }

  return new Ok(undefined);
}

async function migrateDataSource({
  action,
  migrator,
  dataSource,
  execute,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  execute: boolean;
}) {
  const corePrimary = getCorePrimaryDbConnection();

  // Retrieve the core data source.
  const [coreDataSourceRows] = (await corePrimary.query(
    `SELECT id, data_source_id FROM data_sources WHERE project = ? AND data_source_id = ?`,
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
  let nextDocumentId = 0;

  for (;;) {
    const [coreDocumentRows] = (await corePrimary.query(
      "SELECT id, parents, document_id FROM data_sources_documents " +
        "WHERE data_source = ? AND id > ? ORDER BY id ASC LIMIT ?",
      {
        replacements: [coreDataSourceId, nextDocumentId, QUERY_BATCH_SIZE],
      }
    )) as {
      id: number;
      parents: string[];
      document_id: string;
    }[][];

    if (coreDocumentRows.length === 0) {
      break;
    }

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        coreDocumentRows,
        (coreDocument) =>
          migrateDocument({
            action,
            migrator,
            dataSource,
            coreDocument,
            execute,
          }),
        { concurrency: DOCUMENT_CONCURRENCY }
      );
    } catch (e) {
      logger.error(
        {
          error: e,
          nextDataSourceId: dataSource.id,
          nextDocumentId,
        },
        `ERROR`
      );
      throw e;
    }

    nextDocumentId = coreDocumentRows[coreDocumentRows.length - 1].id;
  }

  // For all the tables in the data source (can be big).
  let nextTableId = 0;

  for (;;) {
    const [coreTableRows] = (await corePrimary.query(
      "SELECT id, parents, table_id FROM tables " +
        "WHERE data_source = ? AND id > ? ORDER BY id ASC LIMIT ?",
      {
        replacements: [coreDataSourceId, nextTableId, QUERY_BATCH_SIZE],
      }
    )) as {
      id: number;
      parents: string[];
      table_id: string;
    }[][];

    if (coreTableRows.length === 0) {
      break;
    }

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        coreTableRows,
        (coreTable) =>
          migrateTable({
            action,
            migrator,
            dataSource,
            coreTable,
            execute,
          }),
        { concurrency: TABLE_CONCURRENCY }
      );
    } catch (e) {
      logger.error(
        {
          error: e,
          nextDataSourceId: dataSource.id,
          nextTableId,
        },
        `ERROR`
      );
      throw e;
    }

    nextTableId = coreTableRows[coreTableRows.length - 1].id;
  }
}

async function migrateAll({
  provider,
  action,
  migrator,
  nextDataSourceId,
  execute,
}: {
  provider: ConnectorProvider;
  action: MigratorAction;
  migrator: ProviderMigrator;
  nextDataSourceId: number;
  execute: boolean;
}) {
  // retrieve all data sources for the provider
  const dataSources = await DataSourceModel.findAll({
    where: {
      connectorProvider: provider,
    },
    order: [["id", "ASC"]],
  });

  for (const dataSource of dataSources) {
    if (dataSource.id >= nextDataSourceId) {
      await migrateDataSource({
        migrator,
        action,
        dataSource,
        execute,
      });
    } else {
      logger.info({ dataSourceId: dataSource.id }, "SKIP");
    }
  }
}

makeScript(
  {
    provider: {
      type: "string",
      required: true,
    },
    action: {
      type: "string",
      required: true,
    },
    nextDataSourceId: {
      type: "number",
      required: false,
      default: 0,
    },
  },
  async ({ provider, action, nextDataSourceId, execute }) => {
    if (!isMigratorAction(action)) {
      console.error(
        `Invalid action ${action}, supported actions are "transform" and "clean"`
      );
      return;
    }
    if (!isConnectorProvider(provider)) {
      console.error(`Invalid provider ${provider}`);
      return;
    }
    if (!migrators[provider]) {
      console.error(`No migrator found for provider ${provider}`);
      return;
    }

    await migrateAll({
      provider,
      action,
      migrator: migrators[provider],
      nextDataSourceId,
      execute,
    });
  }
);
