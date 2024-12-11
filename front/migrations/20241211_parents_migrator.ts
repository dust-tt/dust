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
  transformer: (parents: string[]) => string[];
  cleaner: (parents: string[]) => string[];
};

const DOCUMENT_QUERY_BATCH_SIZE = 128;
const DOCUMENT_CONCURRENCY = 8;

const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: {
    transformer: (parents) => {
      return parents;
    },
    cleaner: (parents) => {
      return parents;
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
    hash: string;
  };
  execute: boolean;
}) {
  const newParents =
    action === "transform"
      ? migrator.transformer(coreDocument.parents)
      : migrator.cleaner(coreDocument.parents);

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
      `LIVE: document_id=${coreDocument.document_id} parents=${newParents}`
    );
  } else {
    logger.info(
      `DRY: document_id=${coreDocument.document_id} parents=${newParents}`
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
    hash: string;
  };
  execute: boolean;
}) {
  const newParents =
    action === "transform"
      ? migrator.transformer(coreTable.parents)
      : migrator.cleaner(coreTable.parents);

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

    logger.info(`LIVE: table_id=${coreTable.table_id} parents=${newParents}`);
  } else {
    logger.info(`DRY: table_id=${coreTable.table_id} parents=${newParents}`);
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
      "SELECT id, parents, document_id, hash FROM data_sources_documents " +
        "WHERE data_source = ? AND id > ? ORDER BY id ASC LIMIT ?",
      {
        replacements: [
          coreDataSourceId,
          nextDocumentId,
          DOCUMENT_QUERY_BATCH_SIZE,
        ],
      }
    )) as {
      id: number;
      parents: string[];
      document_id: string;
      hash: string;
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
        `ERROR: error=${e} nextDataSourceId=${dataSource.id} nextDocumentId=${nextDocumentId}`
      );
      throw e;
    }

    nextDocumentId = coreDocumentRows[coreDocumentRows.length - 1].id;
  }

  // For all the tables in the data source (can be big).
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
      logger.info("SKIP: dataSourceId=" + dataSource.id);
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
